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

// A partner's own dashboard listing everything raised against its project's
// (or client company's) form — same token as submitFeedbackSchema, paginated.
export const publicCompanyTicketsSchema = z.object({
  params: z.object({ token: z.string().uuid() }),
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    type: z.enum(feedbackTypes).optional(),
  }),
});

// ── Submitter's own ticket history (public, no account) ─────────────────────

export const requestMyTicketsCodeSchema = z.object({
  body: z.object({ email: z.string().email().max(255) }),
});

export const listMyTicketsSchema = z.object({
  body: z.object({
    email: z.string().email().max(255),
    code: z.string().length(6),
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
  body: z.object({
    supportStatus: z.enum(supportStatuses),
    // Optional — emailed to the submitter alongside the generic stage copy.
    note: z.string().max(3000).optional(),
  }),
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

export const feedbackLinkSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({ enabled: z.boolean() }),
});

// ── Ticket comment thread (staff side — product team and IT support both use
// these same shapes, mounted on their own route files) ──────────────────────

export const fetchFeedbackCommentsSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});

export const addFeedbackCommentSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({ body: z.string().min(1).max(3000) }),
});

// ── Ticket comment thread (public — the submitter proves ownership the same
// way "My Tickets" does: email + the same emailed OTP code) ─────────────────

export const publicFetchCommentsSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    email: z.string().email().max(255),
    code: z.string().length(6),
  }),
});

export const publicAddCommentSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    email: z.string().email().max(255),
    code: z.string().length(6),
    body: z.string().min(1).max(3000),
  }),
});

// A resolved ticket's one-time satisfaction rating, from the "My Tickets"
// page — same email/code proof of ownership as listMyTicketsSchema.
export const submitRatingSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    email: z.string().email().max(255),
    code: z.string().length(6),
    rating: z.number().int().min(1).max(5),
  }),
});
