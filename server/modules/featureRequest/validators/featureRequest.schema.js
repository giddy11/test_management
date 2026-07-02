// modules/featureRequest/validators/featureRequest.schema.js
const { z } = require("zod");
const { enums } = require("../../../config/constants");

const createFeatureRequestSchema = z.object({
  body: z.object({
    title: z.string().min(1).max(200),
    description: z.string().min(1).max(3000),
    category: z.string().max(50).optional(),
  }),
});

const updateStatusSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z
    .object({
      status: z.enum(enums.featureRequestStatus).optional(),
      adminResponse: z.string().max(3000).nullable().optional(),
    })
    .refine((b) => Object.keys(b).length > 0, {
      message: "At least one field must be provided",
    }),
});

const idParamSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});

const fetchFeatureRequestsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(enums.featureRequestStatus).optional(),
    category: z.string().max(50).optional(),
    search: z.string().optional(),
    sort: z.enum(["top", "newest"]).default("top"),
  }),
});

const commentSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    body: z.string().min(1).max(1000),
  }),
});

const fetchCommentsSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

const commentIdParamSchema = z.object({
  params: z.object({ id: z.string().uuid(), commentId: z.string().uuid() }),
});

module.exports = {
  createFeatureRequestSchema,
  updateStatusSchema,
  idParamSchema,
  fetchFeatureRequestsSchema,
  commentSchema,
  fetchCommentsSchema,
  commentIdParamSchema,
};
