// modules/serviceDesk/tests/serviceDesk.spec.ts
// IT requests: the lifecycle table, form definitions and answers, the default
// catalog, the approval engine, service levels and information requests.
import {
  AGENT_CANCELLABLE,
  REQUESTER_CANCELLABLE,
  REQUEST_STATUSES,
  canTransition,
  assertTransition,
  formatReference,
  parseReference,
  statusOnSubmit,
  coversRisk,
  type RequestStatus,
} from "../domain/lifecycle";
import { formSchemaSchema, validateFormValues, type FormField } from "../domain/formSchema";
import { DEFAULT_CATALOG } from "../domain/defaultCatalog";
import {
  NoApproverError,
  buildPlan,
  policyStepsSchema,
  rowsMadeRedundant,
  stepState,
  stepsForApprovers,
  type PlanContext,
  type PolicyStep,
} from "../domain/approvalPlan";
import { DEFAULT_SERVICE_LEVELS, escalationLevelAt, fulfilmentTargetHours, serviceLevelsSchema } from "../domain/serviceLevels";

const { AppError } = require("../../../shared/errors/AppError");

describe("request lifecycle", () => {
  it("never lets work start before approval", () => {
    expect(canTransition("pending_approval", "in_progress")).toBe(false);
    expect(canTransition("rejected", "in_progress")).toBe(false);
    expect(canTransition("draft", "in_progress")).toBe(false);
    expect(canTransition("approved", "in_progress")).toBe(true);
    expect(canTransition("submitted", "in_progress")).toBe(true);
  });

  it("treats rejected, fulfilled and cancelled as final", () => {
    for (const end of ["rejected", "fulfilled", "cancelled"] as RequestStatus[]) {
      for (const to of REQUEST_STATUSES) expect({ end, to, ok: canTransition(end, to) }).toEqual({ end, to, ok: false });
    }
  });

  it("sends a submission to approval only when the item needs it", () => {
    expect(statusOnSubmit(true)).toBe("pending_approval");
    expect(statusOnSubmit(false)).toBe("submitted");
  });

  it("lets a requester withdraw only until IT starts, and IT cancel what reached it", () => {
    expect(REQUESTER_CANCELLABLE).not.toContain("in_progress");
    expect(AGENT_CANCELLABLE).toContain("in_progress");
    expect(AGENT_CANCELLABLE).not.toContain("draft");
    expect(AGENT_CANCELLABLE).not.toContain("pending_approval");
  });

  it("refuses an illegal move with a 409", () => {
    expect(() => assertTransition("fulfilled", "in_progress")).toThrow(AppError);
    try {
      assertTransition("fulfilled", "in_progress");
    } catch (e) {
      expect((e as { statusCode: number }).statusCode).toBe(409);
    }
  });

  it("formats and parses SR references", () => {
    expect(formatReference(123)).toBe("SR-000123");
    expect(parseReference("SR-000123")).toBe(123);
    expect(parseReference("sr-45")).toBe(45);
    expect(parseReference("45")).toBe(45);
    expect(parseReference("laptop")).toBeNull();
  });
});

describe("form definitions", () => {
  it("accepts every default catalog form", () => {
    for (const c of DEFAULT_CATALOG) {
      for (const item of c.items) {
        expect({ item: item.name, ok: formSchemaSchema.safeParse(item.formSchema).success }).toEqual({ item: item.name, ok: true });
      }
    }
  });

  it("covers the eight categories the stories name", () => {
    expect(DEFAULT_CATALOG.map((c) => c.key)).toEqual([
      "software_access",
      "hardware",
      "new_account",
      "password_reset",
      "business_application",
      "cloud_resource",
      "access_card",
      "it_solution",
    ]);
  });

  it("rejects duplicate keys, bad keys and choice fields without options", () => {
    expect(formSchemaSchema.safeParse([
      { key: "a", label: "A", type: "text" },
      { key: "a", label: "B", type: "text" },
    ]).success).toBe(false);
    expect(formSchemaSchema.safeParse([{ key: "Bad Key", label: "A", type: "text" }]).success).toBe(false);
    expect(formSchemaSchema.safeParse([{ key: "pick", label: "Pick", type: "select" }]).success).toBe(false);
  });

  it("never makes a checkbox required", () => {
    const parsed = formSchemaSchema.parse([{ key: "ok", label: "OK", type: "checkbox", required: true }]);
    expect(parsed[0].required).toBe(false);
  });
});

describe("form answers", () => {
  const schema: FormField[] = [
    { key: "software", label: "Software", type: "text", required: true },
    { key: "level", label: "Level", type: "select", required: true, options: ["Standard", "Admin"] },
    { key: "seats", label: "Seats", type: "number", required: false },
    { key: "needed_by", label: "Needed by", type: "date", required: false },
    { key: "systems", label: "Systems", type: "multiselect", required: false, options: ["Email", "VPN"] },
    { key: "urgent", label: "Urgent", type: "checkbox", required: false },
  ];

  it("keeps valid answers and drops keys the form doesn't have", () => {
    const { values, errors } = validateFormValues(schema, {
      software: "  Adobe Acrobat ",
      level: "Standard",
      seats: "2",
      needed_by: "2026-11-01",
      systems: ["Email", "Email"],
      urgent: true,
      removed_field: "x",
    });
    expect(errors).toEqual([]);
    expect(values).toEqual({
      software: "Adobe Acrobat",
      level: "Standard",
      seats: 2,
      needed_by: "2026-11-01",
      systems: ["Email"],
      urgent: true,
    });
  });

  it("requires required answers on submit but not on a draft", () => {
    expect(validateFormValues(schema, {}).errors.map((e) => e.field)).toEqual(["formValues.software", "formValues.level"]);
    expect(validateFormValues(schema, {}, { partial: true }).errors).toEqual([]);
  });

  it("rejects a wrong answer even on a draft", () => {
    const { errors } = validateFormValues(schema, { level: "Owner", seats: "many", needed_by: "soon" }, { partial: true });
    expect(errors.map((e) => e.field)).toEqual(["formValues.level", "formValues.seats", "formValues.needed_by"]);
  });
});

describe("approval plan — who approves", () => {
  const ctx = (over: Partial<PlanContext> = {}): PlanContext => ({
    risk: "medium",
    excluded: new Set(["req"]),
    eligible: new Set(["mgr", "fin1", "fin2", "sec1", "admin", "req", "deputy", "boss"]),
    lineManagerId: "boss",
    groups: new Map([
      ["finance", { name: "Finance", maxRiskLevel: "high", memberIds: ["fin1", "fin2"] }],
      ["security", { name: "Security", maxRiskLevel: "low", memberIds: ["sec1"] }],
    ]),
    delegateOf: () => null,
    fallbackIds: ["admin"],
    ...over,
  });
  const ids = (step: { approvers: { userId: string }[] }) => step.approvers.map((a) => a.userId);

  it("asks any one named approver, never the requester", () => {
    const [step] = buildPlan(stepsForApprovers(["mgr", "req"]), ctx());
    expect(ids(step)).toEqual(["mgr"]);
    expect(step.mode).toBe("any");
  });

  it("falls back to the catalog managers when the item names nobody eligible", () => {
    const [step] = buildPlan(stepsForApprovers(["req"]), ctx());
    expect(step.approvers).toEqual([{ userId: "admin", ruleIndex: 0, groupId: null, onBehalfOfId: null, isFallback: true }]);
  });

  it("refuses rather than letting a request skip approval", () => {
    expect(() => buildPlan(stepsForApprovers([]), ctx({ fallbackIds: ["req"] }))).toThrow(NoApproverError);
  });

  it("keeps steps in order and resolves the line manager", () => {
    const steps: PolicyStep[] = [
      { name: "Manager", mode: "any", approvers: [{ type: "line_manager" }] },
      { name: "Finance", mode: "any", approvers: [{ type: "group", groupId: "finance" }] },
    ];
    const plan = buildPlan(steps, ctx());
    expect(plan.map((s) => [s.order, s.name, ids(s)])).toEqual([
      [1, "Manager", ["boss"]],
      [2, "Finance", ["fin1", "fin2"]],
    ]);
  });

  it("gives a group no say above its authority", () => {
    const steps: PolicyStep[] = [{ name: "Security", mode: "any", approvers: [{ type: "group", groupId: "security" }] }];
    // Security may approve up to low; this request is medium — so the admins decide.
    expect(ids(buildPlan(steps, ctx())[0])).toEqual(["admin"]);
    expect(ids(buildPlan(steps, ctx({ risk: "low" }))[0])).toEqual(["sec1"]);
  });

  it("fills an unstaffable rule of an all-step from the fallback, keeping the others", () => {
    const steps: PolicyStep[] = [
      {
        name: "Both",
        mode: "all",
        approvers: [
          { type: "group", groupId: "finance" },
          { type: "line_manager" },
        ],
      },
    ];
    const [step] = buildPlan(steps, ctx({ lineManagerId: null }));
    expect(step.approvers.map((a) => [a.userId, a.ruleIndex, a.isFallback])).toEqual([
      ["fin1", 0, false],
      ["fin2", 0, false],
      ["admin", 1, true],
    ]);
  });

  it("hands an absent approver's place to their delegate", () => {
    const [step] = buildPlan(stepsForApprovers(["mgr"]), ctx({ delegateOf: (u) => (u === "mgr" ? "deputy" : null) }));
    expect(step.approvers).toEqual([{ userId: "deputy", ruleIndex: 0, groupId: null, onBehalfOfId: "mgr", isFallback: false }]);
  });

  it("never lets the requester stand in as a delegate", () => {
    const [step] = buildPlan(stepsForApprovers(["mgr"]), ctx({ delegateOf: () => "req" }));
    expect(step.approvers.map((a) => [a.userId, a.onBehalfOfId])).toEqual([["mgr", null]]);
  });

  it("validates policy definitions", () => {
    expect(policyStepsSchema.safeParse([]).success).toBe(false);
    expect(policyStepsSchema.safeParse([{ name: "x", mode: "any", approvers: [] }]).success).toBe(false);
    expect(policyStepsSchema.safeParse([{ mode: "all", approvers: [{ type: "line_manager" }] }]).success).toBe(true);
  });
});

describe("approval steps — deciding", () => {
  it("completes an any-step on the first approval", () => {
    expect(stepState("any", [{ ruleIndex: 0, decision: "approved" }, { ruleIndex: 0, decision: "pending" }])).toBe("approved");
  });

  it("completes an all-step only when every rule has an approval", () => {
    const rows = [
      { ruleIndex: 0, decision: "approved" },
      { ruleIndex: 0, decision: "pending" },
      { ruleIndex: 1, decision: "pending" },
    ];
    expect(stepState("all", rows)).toBe("pending");
    expect(stepState("all", [...rows.slice(0, 2), { ruleIndex: 1, decision: "approved" }])).toBe("approved");
  });

  it("rejects the step on any rejection", () => {
    expect(stepState("all", [{ ruleIndex: 0, decision: "approved" }, { ruleIndex: 1, decision: "rejected" }])).toBe("rejected");
  });

  it("skips the rows an approval made unnecessary", () => {
    const rows = [
      { id: "a", ruleIndex: 0, decision: "approved" },
      { id: "b", ruleIndex: 0, decision: "pending" },
      { id: "c", ruleIndex: 1, decision: "pending" },
    ];
    expect(rowsMadeRedundant("any", rows, rows[0]).map((r) => r.id)).toEqual(["b", "c"]);
    expect(rowsMadeRedundant("all", rows, rows[0]).map((r) => r.id)).toEqual(["b"]);
  });

  it("checks authority against risk", () => {
    expect(coversRisk("high", "medium")).toBe(true);
    expect(coversRisk("medium", "high")).toBe(false);
    expect(coversRisk("critical", "critical")).toBe(true);
  });
});

describe("service levels and escalation", () => {
  const rules = DEFAULT_SERVICE_LEVELS.escalation; // level 2 at +50%, level 3 at +100%
  const due = new Date("2026-10-01T12:00:00Z");
  const at = (hoursAfterDue: number) => new Date(due.getTime() + hoursAfterDue * 3_600_000);

  it("is not late before the due time", () => {
    expect(escalationLevelAt(at(-1), due, 24, rules)).toBe(0);
  });

  it("climbs through the three levels against the target", () => {
    expect(escalationLevelAt(at(0), due, 24, rules)).toBe(1);
    expect(escalationLevelAt(at(11), due, 24, rules)).toBe(1);
    expect(escalationLevelAt(at(12), due, 24, rules)).toBe(2);
    expect(escalationLevelAt(at(24), due, 24, rules)).toBe(3);
  });

  it("uses an item's own hours over the organisation's", () => {
    expect(fulfilmentTargetHours(DEFAULT_SERVICE_LEVELS, "high", null)).toBe(24);
    expect(fulfilmentTargetHours(DEFAULT_SERVICE_LEVELS, "high", 4)).toBe(4);
  });

  it("insists the third escalation comes after the second", () => {
    const bad = { ...DEFAULT_SERVICE_LEVELS, escalation: { level2Pct: 100, level3Pct: 50, contactIds: [] } };
    expect(serviceLevelsSchema.safeParse(bad).success).toBe(false);
    expect(serviceLevelsSchema.safeParse(DEFAULT_SERVICE_LEVELS).success).toBe(true);
  });
});

describe("waiting for information", () => {
  it("pauses from any working state and returns to it", () => {
    for (const s of ["submitted", "pending_approval", "approved", "in_progress"] as RequestStatus[]) {
      expect({ s, out: canTransition(s, "info_requested"), back: canTransition("info_requested", s) }).toEqual({ s, out: true, back: true });
    }
    expect(canTransition("info_requested", "fulfilled")).toBe(false);
    expect(canTransition("info_requested", "rejected")).toBe(false);
  });
});
