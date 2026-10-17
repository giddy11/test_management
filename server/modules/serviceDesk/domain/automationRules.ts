// modules/serviceDesk/domain/automationRules.ts
// Automation rules (story 2): "when a request looks like this, do that."
// Pure — matching and the auto-approval verdict are tested on their own.
//
// Rules run once, when a request is submitted, lowest sortOrder first. Every
// rule whose conditions all hold applies; where two set the same thing
// (priority, assignee) the later one wins, and flags and notes accumulate.
//
// What a rule can never do (BR 2.1–2.4): add or remove an approval step.
// The single exception is automatic approval, and it needs BOTH a rule that
// asks for it AND an item that allows it — and even then only for a
// low-risk, non-privileged item needing no identity check, on a request
// nobody flagged for review. Otherwise the request goes to its approvers as
// normal and the run records why automation stepped aside.
import { z } from "zod";
import { REQUEST_PRIORITIES, RISK_LEVELS, type RequestPriority, type RiskLevel } from "./lifecycle";
import type { FormValues } from "./formSchema";

const uuid = z.string().uuid();

export const ruleConditionsSchema = z.object({
  categoryKeys: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  itemIds: z.array(uuid).max(50).default([]),
  priorities: z.array(z.enum(REQUEST_PRIORITIES)).default([]),
  riskLevels: z.array(z.enum(RISK_LEVELS)).default([]),
  // true: only requests for a new starter; false: never; null: either.
  forNewStarter: z.boolean().nullable().default(null),
  // Every one must hold. Multi-choice answers match if they include the value.
  answers: z
    .array(z.object({ key: z.string().trim().min(1).max(40), value: z.union([z.string().trim().max(200), z.number(), z.boolean()]) }))
    .max(10)
    .default([]),
  // Case-insensitive, in the title or description.
  textContains: z.string().trim().max(100).default(""),
});
export type RuleConditions = z.infer<typeof ruleConditionsSchema>;

export const ruleActionsSchema = z
  .object({
    setPriority: z.enum(REQUEST_PRIORITIES).nullable().default(null),
    assignToId: uuid.nullable().default(null),
    // Non-empty = flag for review, with this as the reason.
    flagForReview: z.string().trim().max(300).default(""),
    internalNote: z.string().trim().max(2000).default(""),
    autoApprove: z.boolean().default(false),
  })
  .refine((a) => a.setPriority || a.assignToId || a.flagForReview || a.internalNote || a.autoApprove, {
    message: "A rule needs at least one action",
  });
export type RuleActions = z.infer<typeof ruleActionsSchema>;

export interface RuleLike {
  id: string;
  name: string;
  sortOrder: number;
  conditions: RuleConditions;
  actions: RuleActions;
}

// What a rule looks at.
export interface RuleSubject {
  categoryKey: string;
  itemId: string;
  priority: RequestPriority;
  riskLevel: RiskLevel;
  forNewStarter: boolean;
  formValues: FormValues;
  title: string;
  description: string | null;
}

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

function answerMatches(actual: unknown, wanted: string | number | boolean): boolean {
  if (actual === undefined || actual === null) return false;
  if (Array.isArray(actual)) return actual.some((a) => norm(a) === norm(wanted));
  if (typeof wanted === "boolean") return actual === wanted || norm(actual) === String(wanted);
  if (typeof wanted === "number") return Number(actual) === wanted;
  return norm(actual) === norm(wanted);
}

export function ruleMatches(c: RuleConditions, s: RuleSubject): boolean {
  if (c.categoryKeys.length && !c.categoryKeys.includes(s.categoryKey)) return false;
  if (c.itemIds.length && !c.itemIds.includes(s.itemId)) return false;
  if (c.priorities.length && !c.priorities.includes(s.priority)) return false;
  if (c.riskLevels.length && !c.riskLevels.includes(s.riskLevel)) return false;
  if (c.forNewStarter !== null && c.forNewStarter !== s.forNewStarter) return false;
  if (c.answers.some((a) => !answerMatches(s.formValues[a.key], a.value))) return false;
  if (c.textContains && !`${s.title}\n${s.description ?? ""}`.toLowerCase().includes(c.textContains.toLowerCase())) return false;
  return true;
}

export interface RuleOutcome {
  matched: { id: string; name: string; actions: RuleActions }[];
  priority: RequestPriority | null;
  assignToId: string | null;
  flags: { rule: string; reason: string }[];
  notes: { rule: string; text: string }[];
  autoApproveBy: string | null; // the (last) rule that asked for it
}

export function evaluateRules(rules: RuleLike[], subject: RuleSubject): RuleOutcome {
  const out: RuleOutcome = { matched: [], priority: null, assignToId: null, flags: [], notes: [], autoApproveBy: null };
  const ordered = [...rules].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  for (const rule of ordered) {
    if (!ruleMatches(rule.conditions, subject)) continue;
    const a = rule.actions;
    out.matched.push({ id: rule.id, name: rule.name, actions: a });
    if (a.setPriority) out.priority = a.setPriority;
    if (a.assignToId) out.assignToId = a.assignToId;
    if (a.flagForReview) out.flags.push({ rule: rule.name, reason: a.flagForReview });
    if (a.internalNote) out.notes.push({ rule: rule.name, text: a.internalNote });
    if (a.autoApprove) out.autoApproveBy = rule.name;
  }
  return out;
}

export interface AutoApprovalItem {
  autoApprove: boolean;
  riskLevel: RiskLevel;
  isPrivileged: boolean;
  requiresIdentityCheck: boolean;
}

// May this request skip its approvers? Returns why not, or null for "yes".
export function autoApprovalRefusal(item: AutoApprovalItem, flagged: boolean): string | null {
  if (!item.autoApprove) return "the catalog item doesn't allow automatic approval";
  if (item.isPrivileged) return "privileged access always needs a person to approve it";
  if (item.riskLevel !== "low") return `only low-risk items can be approved automatically (this one is ${item.riskLevel})`;
  if (item.requiresIdentityCheck) return "items that need an identity check always need a person";
  if (flagged) return "a rule flagged it for review";
  return null;
}
