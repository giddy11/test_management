// modules/serviceDesk/validators/serviceDesk.schema.ts
// Request shapes for every IT-requests route. A request's form answers are
// only checked for shape here (a plain object); whether they fit the catalog
// item's form is the domain's job (formSchema.validateFormValues), because the
// form is data, not code.
import { z } from "zod";
import { formSchemaSchema } from "../domain/formSchema";
import { APPROVAL_MODES, REQUEST_PRIORITIES, REQUEST_STATUSES, RISK_LEVELS } from "../domain/lifecycle";
import { policyStepsSchema } from "../domain/approvalPlan";
import { serviceLevelsSchema } from "../domain/serviceLevels";
import { FULFILMENT_TYPES, callbackBodySchema } from "../domain/fulfilment";
import { editMessageSchema, postMessageSchema } from "../domain/conversation";
import { ruleActionsSchema, ruleConditionsSchema } from "../domain/automationRules";

// An item's own service level, in hours; null = the organisation's default.
const hoursOverride = z.number().int().min(1).max(24 * 90).nullable();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

const id = z.string().uuid();
const idParams = z.object({ id });
const optionalText = (max: number) => z.string().trim().max(max).nullish().transform((v) => v || null);
const page = z.coerce.number().int().min(1).default(1);
const limit = z.coerce.number().int().min(1).max(100).default(20);

// ── Settings ─────────────────────────────────────────────────────────────────
export const updateSettingsSchema = z.object({
  body: z.object({ enabled: z.boolean() }),
});

// Either switch, or both; whichever is left out stays as it is.
export const updateApprovalRulesSchema = z.object({
  body: z
    .object({ agentsCannotApprove: z.boolean().optional(), requireLineManager: z.boolean().optional() })
    .refine((b) => b.agentsCannotApprove !== undefined || b.requireLineManager !== undefined, { message: "Nothing to change" }),
});

// ── Catalog ──────────────────────────────────────────────────────────────────
export const createCategorySchema = z.object({
  body: z.object({
    name: z.string().trim().min(1).max(80),
    description: optionalText(300),
    icon: z.string().trim().max(40).nullish().transform((v) => v || null),
    sortOrder: z.number().int().min(0).max(1000).optional(),
  }),
});

export const updateCategorySchema = z.object({
  params: idParams,
  body: z
    .object({
      name: z.string().trim().min(1).max(80).optional(),
      description: optionalText(300).optional(),
      icon: z.string().trim().max(40).nullish().transform((v) => v || null).optional(),
      sortOrder: z.number().int().min(0).max(1000).optional(),
      isActive: z.boolean().optional(),
    })
    .refine((b) => Object.keys(b).length > 0, { message: "Nothing to update" }),
});

const itemFields = {
  categoryId: id,
  name: z.string().trim().min(1).max(120),
  description: optionalText(2000),
  formSchema: formSchemaSchema,
  approvalMode: z.enum(APPROVAL_MODES),
  approverIds: z.array(id).max(20).transform((ids) => [...new Set(ids)]),
  fulfilmentNotes: optionalText(5000),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0).max(1000),
  approvalPolicyId: id.nullable(),
  riskLevel: z.enum(RISK_LEVELS),
  approvalHours: hoursOverride,
  fulfilmentHours: hoursOverride,
  fulfilmentType: z.enum(FULFILMENT_TYPES),
  fulfilmentConfig: z.object({
    endpointId: id.nullish(),
    url: z.string().trim().max(500).nullish(),
    label: z.string().trim().max(80).nullish(),
  }),
  autoApprove: z.boolean(),
  isPrivileged: z.boolean(),
  requiresIdentityCheck: z.boolean(),
};

export const createItemSchema = z.object({
  body: z
    .object({
      ...itemFields,
      formSchema: itemFields.formSchema.default([]),
      approvalMode: itemFields.approvalMode.default("none"),
      approverIds: itemFields.approverIds.default([]),
      isActive: itemFields.isActive.default(true),
      sortOrder: itemFields.sortOrder.optional(),
      approvalPolicyId: itemFields.approvalPolicyId.default(null),
      riskLevel: itemFields.riskLevel.default("low"),
      approvalHours: itemFields.approvalHours.default(null),
      fulfilmentHours: itemFields.fulfilmentHours.default(null),
      fulfilmentType: itemFields.fulfilmentType.default("manual"),
      fulfilmentConfig: itemFields.fulfilmentConfig.default({}),
      autoApprove: itemFields.autoApprove.default(false),
      isPrivileged: itemFields.isPrivileged.default(false),
      requiresIdentityCheck: itemFields.requiresIdentityCheck.default(false),
    })
    .refine((b) => b.approvalMode !== "policy" || !!b.approvalPolicyId, {
      message: "Pick the approval policy this item follows",
      path: ["approvalPolicyId"],
    }),
});

export const updateItemSchema = z.object({
  params: idParams,
  body: z
    .object({
      categoryId: itemFields.categoryId.optional(),
      name: itemFields.name.optional(),
      description: itemFields.description.optional(),
      formSchema: itemFields.formSchema.optional(),
      approvalMode: itemFields.approvalMode.optional(),
      approverIds: itemFields.approverIds.optional(),
      fulfilmentNotes: itemFields.fulfilmentNotes.optional(),
      isActive: itemFields.isActive.optional(),
      sortOrder: itemFields.sortOrder.optional(),
      approvalPolicyId: itemFields.approvalPolicyId.optional(),
      riskLevel: itemFields.riskLevel.optional(),
      approvalHours: itemFields.approvalHours.optional(),
      fulfilmentHours: itemFields.fulfilmentHours.optional(),
      fulfilmentType: itemFields.fulfilmentType.optional(),
      fulfilmentConfig: itemFields.fulfilmentConfig.optional(),
      autoApprove: itemFields.autoApprove.optional(),
      isPrivileged: itemFields.isPrivileged.optional(),
      requiresIdentityCheck: itemFields.requiresIdentityCheck.optional(),
    })
    .refine((b) => Object.keys(b).length > 0, { message: "Nothing to update" }),
});

export const peopleSchema = z.object({
  query: z.object({ search: z.string().trim().max(100).optional() }),
});

// ── Requests ─────────────────────────────────────────────────────────────────
const requestFields = {
  catalogItemId: id,
  title: z.string().trim().min(1, "Give the request a short title").max(200),
  description: optionalText(10000),
  businessJustification: optionalText(5000),
  priority: z.enum(REQUEST_PRIORITIES),
  formValues: z.record(z.unknown()),
  // Who it's for when it isn't you: a colleague, or a new starter with no
  // account yet (name + email). Both null = it's for the requester.
  requestedForId: id.nullish().transform((v) => v ?? null),
  requestedForName: optionalText(120),
  requestedForEmail: z.string().trim().email().max(255).nullish().transform((v) => v || null),
};

export const createRequestSchema = z.object({
  body: z.object({
    ...requestFields,
    priority: requestFields.priority.default("medium"),
    formValues: requestFields.formValues.default({}),
    // false saves a draft; true submits straight away.
    submit: z.boolean().default(false),
  }),
});

export const updateDraftSchema = z.object({
  params: idParams,
  body: z
    .object({
      catalogItemId: requestFields.catalogItemId.optional(),
      title: requestFields.title.optional(),
      description: requestFields.description.optional(),
      businessJustification: requestFields.businessJustification.optional(),
      priority: requestFields.priority.optional(),
      formValues: requestFields.formValues.optional(),
      requestedForId: requestFields.requestedForId.optional(),
      requestedForName: requestFields.requestedForName.optional(),
      requestedForEmail: requestFields.requestedForEmail.optional(),
    })
    .refine((b) => Object.keys(b).length > 0, { message: "Nothing to update" }),
});

export const listRequestsSchema = z.object({
  query: z.object({
    // mine: what I raised or what was raised for me. queue: IT's view.
    scope: z.enum(["mine", "queue"]).default("mine"),
    status: z.enum(REQUEST_STATUSES).optional(),
    // "ready" = waiting for IT to pick up (submitted or approved).
    // overdue = past its approval or fulfilment service level right now.
    // review = flagged for review (by a rule or a failed automation).
    view: z.enum(["ready", "open", "closed", "overdue", "review"]).optional(),
    assignee: z.union([z.enum(["me", "unassigned"]), id]).optional(),
    search: z.string().trim().min(1).max(120).optional(),
    page,
    limit,
  }),
});

// Can this item be submitted by me (for this colleague) right now?
export const checkSubmissionSchema = z.object({
  query: z.object({ itemId: id, requestedForId: id.optional() }),
});

export const listApprovalsSchema = z.object({
  query: z.object({
    state: z.enum(["pending", "decided"]).default("pending"),
    page,
    limit,
  }),
});

export const requestIdSchema = z.object({ params: idParams });

export const approveSchema = z.object({
  params: idParams,
  body: z.object({ comment: optionalText(2000) }),
});

export const rejectSchema = z.object({
  params: idParams,
  body: z.object({ comment: z.string().trim().min(1, "Say why it's being rejected").max(2000) }),
});

export const cancelSchema = z.object({
  params: idParams,
  body: z.object({ reason: optionalText(2000) }),
});

export const assignSchema = z.object({
  params: idParams,
  body: z.object({ assigneeId: id.nullable() }),
});

export const fulfilSchema = z.object({
  params: idParams,
  body: z.object({ note: z.string().trim().min(1, "Say what was done").max(5000) }),
});

// A message: JSON, or multipart form data when it carries files (so its fields
// arrive as strings — see domain/conversation.ts). It needs words or a file; the
// service checks that, because the files aren't part of the body.
export const commentSchema = z.object({
  params: idParams,
  body: postMessageSchema,
});

const commentParams = z.object({ id, commentId: id });

export const editCommentSchema = z.object({
  params: commentParams,
  body: editMessageSchema,
});

export const commentIdSchema = z.object({ params: commentParams });

// ── Information requests ─────────────────────────────────────────────────────
export const askInfoSchema = z.object({
  params: idParams,
  body: z.object({ question: z.string().trim().min(1, "Say what you need to know").max(2000) }),
});

export const provideInfoSchema = z.object({
  params: idParams,
  body: z.object({ answer: z.string().trim().min(1, "Answer the question").max(5000) }),
});

// ── Attachments ──────────────────────────────────────────────────────────────
export const attachmentParamsSchema = z.object({
  params: z.object({ id, attachmentId: id }),
});

// ── Service levels ───────────────────────────────────────────────────────────
export const serviceLevelsBodySchema = z.object({ body: serviceLevelsSchema });

// ── Approver groups, policies, managers, delegation ──────────────────────────
const groupFields = z.object({
  name: z.string().trim().min(1).max(80),
  description: optionalText(300),
  maxRiskLevel: z.enum(RISK_LEVELS),
  memberIds: z.array(id).max(100).transform((ids) => [...new Set(ids)]),
});

export const createGroupSchema = z.object({
  body: groupFields.extend({
    maxRiskLevel: groupFields.shape.maxRiskLevel.default("medium"),
    memberIds: groupFields.shape.memberIds.default([]),
  }),
});

export const updateGroupSchema = z.object({
  params: idParams,
  body: groupFields.partial().refine((b) => Object.keys(b).length > 0, { message: "Nothing to update" }),
});

export const createPolicySchema = z.object({
  body: z.object({
    name: z.string().trim().min(1).max(80),
    description: optionalText(300),
    steps: policyStepsSchema,
  }),
});

export const updatePolicySchema = z.object({
  params: idParams,
  body: z
    .object({
      name: z.string().trim().min(1).max(80).optional(),
      description: optionalText(300).optional(),
      steps: policyStepsSchema.optional(),
    })
    .refine((b) => Object.keys(b).length > 0, { message: "Nothing to update" }),
});

export const idOnlySchema = z.object({ params: idParams });

export const setManagerSchema = z.object({
  params: z.object({ userId: id }),
  body: z.object({ managerId: id.nullable() }),
});

export const delegationSchema = z.object({
  body: z
    .object({
      delegateId: id,
      startsOn: isoDate,
      endsOn: isoDate,
      note: optionalText(200),
    })
    .refine((b) => b.endsOn >= b.startsOn, { message: "The last day can't be before the first", path: ["endsOn"] }),
});

// ── Reports ──────────────────────────────────────────────────────────────────
export const reportSchema = z.object({
  query: z
    .object({ from: isoDate.optional(), to: isoDate.optional() })
    .refine((q) => !q.from || !q.to || q.from <= q.to, { message: "'from' must be on or before 'to'", path: ["from"] }),
});

// ── Automation (Phase 3) ─────────────────────────────────────────────────────
const ruleFields = {
  name: z.string().trim().min(1).max(80),
  description: optionalText(300),
  sortOrder: z.number().int().min(0).max(10000),
  isActive: z.boolean(),
  conditions: ruleConditionsSchema,
  actions: ruleActionsSchema,
};

export const createRuleSchema = z.object({
  body: z.object({
    ...ruleFields,
    sortOrder: ruleFields.sortOrder.default(100),
    isActive: ruleFields.isActive.default(true),
  }),
});

export const updateRuleSchema = z.object({
  params: idParams,
  body: z
    .object({
      name: ruleFields.name.optional(),
      description: ruleFields.description.optional(),
      sortOrder: ruleFields.sortOrder.optional(),
      isActive: ruleFields.isActive.optional(),
      conditions: ruleFields.conditions.optional(),
      actions: ruleFields.actions.optional(),
    })
    .refine((b) => Object.keys(b).length > 0, { message: "Nothing to update" }),
});

export const dryRunSchema = z.object({
  body: z.object({ conditions: ruleConditionsSchema, actions: ruleActionsSchema }),
});

export const createEndpointSchema = z.object({
  body: z.object({ name: z.string().trim().min(1).max(80), url: z.string().trim().min(1).max(2000) }),
});

export const updateEndpointSchema = z.object({
  params: idParams,
  body: z
    .object({
      name: z.string().trim().min(1).max(80).optional(),
      url: z.string().trim().min(1).max(2000).optional(),
      isActive: z.boolean().optional(),
    })
    .refine((b) => Object.keys(b).length > 0, { message: "Nothing to update" }),
});

export const runsSchema = z.object({
  query: z.object({
    status: z.enum(["succeeded", "failed", "skipped", "pending", "retrying"]).optional(),
    kind: z.enum(["rule", "auto_approve", "webhook", "deflect", "ai_triage"]).optional(),
    page,
    limit,
  }),
});

export const identityCheckSchema = z.object({
  params: idParams,
  body: z.object({
    method: z.string().trim().min(1, "Say how you confirmed who they are").max(60),
    note: optionalText(1000),
  }),
});

export const deflectSchema = z.object({ params: idParams });

// The connector's callback: /public/service-desk/callbacks/:runId/:token
export const callbackSchema = z.object({
  params: z.object({ runId: id, token: z.string().regex(/^[a-f0-9]{64}$/, "Invalid callback") }),
  body: callbackBodySchema,
});

// ── AI (Phase 3) ─────────────────────────────────────────────────────────────
export const intakeSchema = z.object({
  body: z.object({ description: z.string().trim().min(10, "Describe what you need in a sentence or two").max(3000) }),
});

export type GroupBody =Partial<z.infer<typeof groupFields>>;
export type PolicyBody = { name?: string; description?: string | null; steps?: z.infer<typeof policyStepsSchema> };
export type DelegationBody = z.infer<typeof delegationSchema>["body"];
export type ReportQuery = z.infer<typeof reportSchema>["query"];

export type CreateCategoryBody =z.infer<typeof createCategorySchema>["body"];
export type UpdateCategoryBody = z.infer<typeof updateCategorySchema>["body"];
export type CreateItemBody = z.infer<typeof createItemSchema>["body"];
export type UpdateItemBody = z.infer<typeof updateItemSchema>["body"];
export type CreateRequestBody = z.infer<typeof createRequestSchema>["body"];
export type UpdateDraftBody = z.infer<typeof updateDraftSchema>["body"];
export type ListRequestsQuery = z.infer<typeof listRequestsSchema>["query"];
export type ListApprovalsQuery = z.infer<typeof listApprovalsSchema>["query"];
