// modules/serviceDesk/validators/serviceDesk.schema.ts
// Request shapes for every IT-requests route. A request's form answers are
// only checked for shape here (a plain object); whether they fit the catalog
// item's form is the domain's job (formSchema.validateFormValues), because the
// form is data, not code.
import { z } from "zod";
import { formSchemaSchema } from "../domain/formSchema";
import { APPROVAL_MODES, REQUEST_PRIORITIES, REQUEST_STATUSES } from "../domain/lifecycle";

const id = z.string().uuid();
const idParams = z.object({ id });
const optionalText = (max: number) => z.string().trim().max(max).nullish().transform((v) => v || null);
const page = z.coerce.number().int().min(1).default(1);
const limit = z.coerce.number().int().min(1).max(100).default(20);

// ── Settings ─────────────────────────────────────────────────────────────────
export const updateSettingsSchema = z.object({
  body: z.object({ enabled: z.boolean() }),
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
};

export const createItemSchema = z.object({
  body: z.object({
    ...itemFields,
    formSchema: itemFields.formSchema.default([]),
    approvalMode: itemFields.approvalMode.default("none"),
    approverIds: itemFields.approverIds.default([]),
    isActive: itemFields.isActive.default(true),
    sortOrder: itemFields.sortOrder.optional(),
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
    view: z.enum(["ready", "open", "closed"]).optional(),
    assignee: z.union([z.enum(["me", "unassigned"]), id]).optional(),
    search: z.string().trim().min(1).max(120).optional(),
    page,
    limit,
  }),
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

export const commentSchema = z.object({
  params: idParams,
  body: z.object({
    body: z.string().trim().min(1).max(5000),
    internal: z.boolean().default(false),
  }),
});

export type CreateCategoryBody = z.infer<typeof createCategorySchema>["body"];
export type UpdateCategoryBody = z.infer<typeof updateCategorySchema>["body"];
export type CreateItemBody = z.infer<typeof createItemSchema>["body"];
export type UpdateItemBody = z.infer<typeof updateItemSchema>["body"];
export type CreateRequestBody = z.infer<typeof createRequestSchema>["body"];
export type UpdateDraftBody = z.infer<typeof updateDraftSchema>["body"];
export type ListRequestsQuery = z.infer<typeof listRequestsSchema>["query"];
export type ListApprovalsQuery = z.infer<typeof listApprovalsSchema>["query"];
