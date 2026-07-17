// modules/feedback/validators/feedback.schema.ts
import { z } from "zod";

const { enums } = require("../../../config/constants");

// constants.js exposes plain string arrays; zod's enum wants a tuple type.
const feedbackTypes = enums.feedbackType as [string, ...string[]];
const feedbackStatuses = enums.feedbackStatus as [string, ...string[]];

export const publicFormParamSchema = z.object({
  params: z.object({ token: z.string().uuid() }),
});

export const submitFeedbackSchema = z.object({
  params: z.object({ token: z.string().uuid() }),
  body: z.object({
    type: z.enum(feedbackTypes),
    title: z.string().min(1).max(200),
    description: z.string().min(1).max(5000),
    suiteName: z.string().max(200).optional(),
    submitterName: z.string().min(1).max(120),
    submitterEmail: z.string().email().max(255),
    // E.164 (e.g. "+2348012345678") — produced by the international phone input.
    submitterPhone: z.string().regex(/^\+[1-9]\d{6,14}$/, "Invalid phone number").optional(),
  }),
});

export const fetchFeedbackSchema = z.object({
  query: z.object({
    // Optional — omitted means the cross-project view (scoped by role in the service).
    projectId: z.string().uuid().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(feedbackStatuses).optional(),
    type: z.enum(feedbackTypes).optional(),
    search: z.string().optional(),
  }),
});

// ── IT support portal (it_support role) ─────────────────────────────────────
const supportStatuses = enums.supportStatus as [string, ...string[]];
const feedbackSeverities = enums.feedbackSeverity as [string, ...string[]];

export const supportQueueSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    supportStatus: z.enum(supportStatuses).optional(),
    type: z.enum(feedbackTypes).optional(),
    search: z.string().optional(),
    assignedSupporterId: z.string().uuid().optional(),
    unassigned: z.coerce.boolean().optional(),
  }),
});

// Leads only — see FeedbackSupportService.assignToSupporter. supporterId:
// null unassigns the item.
export const assignSupportItemSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({ supporterId: z.string().uuid().nullable() }),
});

// Working-stage progression only (logged → acknowledged → investigating);
// resolved/escalated go through their dedicated endpoints.
export const updateSupportStatusSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({ supportStatus: z.enum(supportStatuses) }),
});

export const supportItemParamSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});

export const resolveSupportSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  // The note is required — it goes in the resolution email to the end user.
  body: z.object({ note: z.string().min(1).max(3000) }),
});

export const escalateSupportSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  // Severity is required — it's how the product team triages what lands in
  // their queue from IT support.
  body: z.object({
    severity: z.enum(feedbackSeverities),
    note: z.string().max(3000).optional(),
  }),
});

export const notifySubmitterSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  // The note is required — it goes in the email telling the end user it's fixed.
  body: z.object({ note: z.string().min(1).max(3000) }),
});

export const manageFeedbackSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z
    .object({
      status: z.enum(feedbackStatuses).optional(),
      assignedToIds: z.array(z.string().uuid()).max(20).optional(),
      adminResponse: z.string().max(3000).nullable().optional(),
    })
    .refine((b) => Object.keys(b).length > 0, {
      message: "At least one field must be provided",
    }),
});

export const feedbackIdParamSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});

// Public — the submitter's verdict via the "awaiting confirmation" email link.
export const submitConfirmationSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    confirmed: z.boolean(),
    // Only meaningful when confirmed is false — why it isn't fixed.
    reason: z.string().max(2000).optional(),
  }),
});

export const feedbackLinkSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({ enabled: z.boolean() }),
});

// ── Partner integration API (server-to-server, x-api-key auth) ─────────────

export const integrationCreateTicketSchema = z.object({
  body: z.object({
    type: z.enum(feedbackTypes),
    title: z.string().min(1).max(200),
    description: z.string().min(1).max(5000),
    submitterName: z.string().min(1).max(120),
    submitterEmail: z.string().email().max(255),
    submitterPhone: z.string().regex(/^\+[1-9]\d{6,14}$/, "Invalid phone number").optional(),
    // The partner's own correlation id — retrying a create call with the same
    // value returns the original ticket instead of making a duplicate.
    externalRef: z.string().min(1).max(120).optional(),
  }),
});

export const integrationListTicketsSchema = z.object({
  query: z.object({
    submitterEmail: z.string().email().max(255),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

export const integrationTicketIdParamSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});
