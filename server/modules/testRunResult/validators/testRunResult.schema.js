// modules/testRunResult/validators/testRunResult.schema.js
const { z } = require("zod");
const { enums } = require("../../../config/constants");

// Add a single test case to an existing run.
const createResultSchema = z.object({
  body: z.object({
    runId: z.string().uuid(),
    testCaseId: z.string().uuid(),
  }),
});

// Record / update the outcome of a run result.
const updateResultSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z
    .object({
      // null clears the result (back to pending).
      status: z.enum(enums.resultStatus).nullable().optional(),
      actualResult: z.string().max(5000).nullable().optional(),
      notes: z.string().max(5000).nullable().optional(),
    })
    .refine((b) => Object.keys(b).length > 0, {
      message: "At least one field must be provided",
    }),
});

const idParamSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});

const fetchResultsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    runId: z.string().uuid(),
    status: z.enum(enums.resultStatus).optional(),
  }),
});

const bulkUpdateSchema = z.object({
  body: z.object({
    runId: z.string().uuid(),
    ids: z.array(z.string().uuid()).min(1).max(200),
    status: z.enum(enums.resultStatus).nullable(),
  }),
});

module.exports = {
  createResultSchema,
  updateResultSchema,
  idParamSchema,
  fetchResultsSchema,
  bulkUpdateSchema,
};
