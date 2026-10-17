// modules/serviceDesk/domain/approvalPlan.ts
// The approval engine's rules, pure so they can be tested on their own.
//
// A policy is an ordered list of steps, taken one after another (sequential).
// Each step lists approver RULES — a named person, an approver group, or the
// requester's line manager — and a mode:
//   any  one approval from anyone in the step completes it
//   all  every rule must be satisfied; a group rule is satisfied by any one
//        of its members (so "Finance AND Security" means one from each)
// Within a step everyone is asked at once (parallel). Any rejection anywhere
// rejects the request.
//
// Building the plan (at submit) turns rules into people:
//   - the requester, and the person the request is for, never approve it
//   - a group below the request's risk lacks the authority, and contributes nobody
//   - someone with an active delegation is replaced by their delegate
//   - a rule that ends up with nobody: in an "any" step it is dropped; in an
//     "all" step, or when the whole step is empty, the decision falls back to
//     the organisation's servicedesk.manage holders. If even that is empty the
//     submission is refused — a request never skips approval by accident.
import { z } from "zod";
import { coversRisk, type RiskLevel } from "./lifecycle";

export type ApproverRule =
  | { type: "line_manager" }
  | { type: "group"; groupId: string }
  | { type: "user"; userId: string };

export type StepMode = "any" | "all";

export interface PolicyStep {
  name: string;
  mode: StepMode;
  approvers: ApproverRule[];
}

export const MAX_STEPS = 10;
export const MAX_RULES_PER_STEP = 20;

const ruleSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("line_manager") }),
  z.object({ type: z.literal("group"), groupId: z.string().uuid() }),
  z.object({ type: z.literal("user"), userId: z.string().uuid() }),
]);

export const policyStepsSchema = z
  .array(
    z.object({
      name: z.string().trim().max(80).default(""),
      mode: z.enum(["any", "all"]).default("any"),
      approvers: z.array(ruleSchema).min(1, "Every step needs at least one approver").max(MAX_RULES_PER_STEP),
    })
  )
  .min(1, "A policy needs at least one step")
  .max(MAX_STEPS, `A policy can have at most ${MAX_STEPS} steps`);

export interface PlannedApprover {
  userId: string;
  ruleIndex: number;
  groupId: string | null;
  onBehalfOfId: string | null; // the person whose delegate this is
  isFallback: boolean;
}

export interface PlannedStep {
  order: number; // 1-based
  name: string;
  mode: StepMode;
  approvers: PlannedApprover[];
}

export interface PlanContext {
  risk: RiskLevel;
  excluded: Set<string>; // requester and requested-for
  // Who may hold an approval row at all (internal, can reach the approvals routes).
  eligible: Set<string>;
  // The line manager the "line_manager" rule means for this request, if any.
  lineManagerId: string | null;
  groups: Map<string, { name: string; maxRiskLevel: string; memberIds: string[] }>;
  // Active delegate for a person today, if any.
  delegateOf: (userId: string) => string | null;
  fallbackIds: string[]; // servicedesk.manage holders
}

export class NoApproverError extends Error {
  constructor(public readonly stepName: string) {
    super(`Nobody can approve step "${stepName}"`);
  }
}

// One rule → the people who may satisfy it (before fallback).
function peopleFor(rule: ApproverRule, ctx: PlanContext): { userId: string; groupId: string | null }[] {
  if (rule.type === "user") return [{ userId: rule.userId, groupId: null }];
  if (rule.type === "line_manager") return ctx.lineManagerId ? [{ userId: ctx.lineManagerId, groupId: null }] : [];
  const group = ctx.groups.get(rule.groupId);
  if (!group || !coversRisk(group.maxRiskLevel, ctx.risk)) return [];
  return group.memberIds.map((userId) => ({ userId, groupId: rule.groupId }));
}

// Applies delegation, then drops anyone who may not decide this request.
function staff(
  people: { userId: string; groupId: string | null }[],
  ruleIndex: number,
  ctx: PlanContext,
  isFallback: boolean
): PlannedApprover[] {
  const out: PlannedApprover[] = [];
  const seen = new Set<string>();
  for (const p of people) {
    const delegate = ctx.delegateOf(p.userId);
    const usable = (id: string) => ctx.eligible.has(id) && !ctx.excluded.has(id);
    let userId = p.userId;
    let onBehalfOfId: string | null = null;
    if (delegate && usable(delegate)) {
      userId = delegate;
      onBehalfOfId = p.userId;
    }
    if (!usable(userId) || seen.has(userId)) continue;
    seen.add(userId);
    out.push({ userId, ruleIndex, groupId: p.groupId, onBehalfOfId, isFallback });
  }
  return out;
}

export function buildPlan(steps: PolicyStep[], ctx: PlanContext): PlannedStep[] {
  return steps.map((step, i) => {
    const name = step.name || `Step ${i + 1}`;
    const fallback = (ruleIndex: number) =>
      staff(ctx.fallbackIds.map((userId) => ({ userId, groupId: null })), ruleIndex, ctx, true);

    let approvers: PlannedApprover[] = [];
    if (step.mode === "all") {
      step.approvers.forEach((rule, ruleIndex) => {
        const people = staff(peopleFor(rule, ctx), ruleIndex, ctx, false);
        const filled = people.length ? people : fallback(ruleIndex);
        if (!filled.length) throw new NoApproverError(name);
        approvers.push(...filled);
      });
    } else {
      step.approvers.forEach((rule, ruleIndex) => approvers.push(...staff(peopleFor(rule, ctx), ruleIndex, ctx, false)));
      if (!approvers.length) approvers = fallback(0);
      if (!approvers.length) throw new NoApproverError(name);
    }
    return { order: i + 1, name, mode: step.mode, approvers };
  });
}

// Where a step stands, from its rows.
export function stepState(
  mode: StepMode,
  rows: { ruleIndex: number; decision: string }[]
): "pending" | "approved" | "rejected" {
  if (rows.some((r) => r.decision === "rejected")) return "rejected";
  const rules = new Set(rows.map((r) => r.ruleIndex));
  const satisfied = new Set(rows.filter((r) => r.decision === "approved").map((r) => r.ruleIndex));
  if (mode === "any") return satisfied.size > 0 ? "approved" : "pending";
  return [...rules].every((r) => satisfied.has(r)) ? "approved" : "pending";
}

// The rows no longer needed once one approval lands: in an "any" step, every
// other pending row; in an "all" step, the other pending rows of the same rule.
export function rowsMadeRedundant<T extends { id: string; ruleIndex: number; decision: string }>(
  mode: StepMode,
  rows: T[],
  approved: T
): T[] {
  return rows.filter(
    (r) => r.id !== approved.id && r.decision === "pending" && (mode === "any" || r.ruleIndex === approved.ruleIndex)
  );
}

// The simple "approvers" mode is a one-step policy: any one named person.
export function stepsForApprovers(approverIds: string[]): PolicyStep[] {
  return [{ name: "Approval", mode: "any", approvers: approverIds.map((userId) => ({ type: "user" as const, userId })) }];
}
