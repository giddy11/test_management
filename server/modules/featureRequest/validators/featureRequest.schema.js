// modules/featureRequest/validators/featureRequest.schema.js
const { z } = require("zod");
const { enums } = require("../../../config/constants");
const { dateRangeQuery } = require("../../../shared/utils/dateRange");

const createFeatureRequestSchema = z.object({
  body: z.object({
    projectId: z.string().uuid(),
    title: z.string().min(1).max(200),
    description: z.string().min(1).max(3000),
    category: z.string().max(50).optional(),
    module: z.string().max(100).optional(),
    referenceLinks: z.array(z.string().url()).max(10).optional(),
  }),
});

const updateStatusSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z
    .object({
      status: z.enum(enums.featureRequestStatus).optional(),
      adminResponse: z.string().max(3000).nullable().optional(),
      assignedToId: z.string().uuid().nullable().optional(),
    })
    .refine((b) => Object.keys(b).length > 0, {
      message: "At least one field must be provided",
    }),
});

const idParamSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});

const codeParamSchema = z.object({
  // "FR-20260714-009", or the older dateless "FR-009" (see shared/utils/referenceCode).
  params: z.object({ code: z.string().regex(/^FR-(?:\d{8}-)?\d+$/i, "Invalid reference code") }),
});

const fetchFeatureRequestsSchema = z.object({
  query: dateRangeQuery({
    projectId: z.string().uuid(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(enums.featureRequestStatus).optional(),
    category: z.string().max(50).optional(),
    search: z.string().optional(),
    // Which field `search` is matched against. Requests have no suite or assignee.
    searchBy: z.enum(["title", "reporter"]).default("title"),
    sort: z.enum(["top", "newest"]).default("top"),
  }),
});

const commentSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    body: z.string().min(1).max(1000),
    // Firestore doc id of the comment being replied to — omitted/undefined for
    // a top-level comment.
    parentId: z.string().min(1).optional(),
    // @mentioned users, picked from the composer's autocomplete — validated
    // against project membership server-side (see FeatureRequestService._resolveMentions).
    mentionedUserIds: z.array(z.string().uuid()).max(20).optional(),
  }),
});

const editCommentSchema = z.object({
  params: z.object({ id: z.string().uuid(), commentId: z.string().min(1) }),
  body: z.object({
    body: z.string().min(1).max(1000),
  }),
});

const reactionSchema = z.object({
  params: z.object({ id: z.string().uuid(), commentId: z.string().min(1) }),
  body: z.object({
    // null clears the caller's own reaction.
    reaction: z.enum(["like", "dislike"]).nullable(),
  }),
});

const fetchCommentsSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

// commentId is a Firestore document id, not a uuid.
const commentIdParamSchema = z.object({
  params: z.object({ id: z.string().uuid(), commentId: z.string().min(1) }),
});

module.exports = {
  createFeatureRequestSchema,
  updateStatusSchema,
  idParamSchema,
  codeParamSchema,
  fetchFeatureRequestsSchema,
  commentSchema,
  editCommentSchema,
  reactionSchema,
  fetchCommentsSchema,
  commentIdParamSchema,
};
