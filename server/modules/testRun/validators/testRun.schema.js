// modules/testRun/validators/testRun.schema.js
const { z } = require("zod");
const { enums } = require("../../../config/constants");

const createTestRunSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(200),
    projectId: z.string().uuid(),
    suiteId: z.string().uuid(),
  }),
});

const updateTestRunSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z
    .object({
      name: z.string().min(1).max(200).optional(),
      status: z.enum(enums.runStatus).optional(),
    })
    .refine((b) => Object.keys(b).length > 0, {
      message: "At least one field must be provided",
    }),
});

const idParamSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});

const fetchTestRunsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    projectId: z.string().uuid(),
    // Narrows to runs still in progress — the tab-count "pending" figure.
    pending: z.coerce.boolean().optional(),
  }),
});

const fetchActiveStatusSchema = z.object({
  query: z.object({
    projectId: z.string().uuid(),
  }),
});

module.exports = {
  createTestRunSchema,
  updateTestRunSchema,
  idParamSchema,
  fetchTestRunsSchema,
  fetchActiveStatusSchema,
};
