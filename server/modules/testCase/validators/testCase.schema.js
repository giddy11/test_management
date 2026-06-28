// modules/testCase/validators/testCase.schema.js
const { z } = require("zod");
const { enums } = require("../../../config/constants");

const createTestCaseSchema = z.object({
  body: z.object({
    title: z.string().min(1).max(200),
    description: z.string().max(5000).optional(),
    steps: z.array(z.string().min(1)).min(1),
    expectedResult: z.string().min(1),
    priority: z.enum(enums.testCasePriority),
    status: z.enum(enums.testCaseStatus).optional(),
    suite: z.string().uuid(),
    assignedTo: z.string().uuid().optional(),
    tags: z.array(z.string()).optional(),
  }),
});

const updateTestCaseSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z
    .object({
      title: z.string().min(1).max(200).optional(),
      description: z.string().max(5000).nullable().optional(),
      steps: z.array(z.string().min(1)).min(1).optional(),
      expectedResult: z.string().min(1).optional(),
      priority: z.enum(enums.testCasePriority).optional(),
      status: z.enum(enums.testCaseStatus).optional(),
      assignedTo: z.string().uuid().nullable().optional(),
      tags: z.array(z.string()).nullable().optional(),
    })
    .refine((b) => Object.keys(b).length > 0, {
      message: "At least one field must be provided",
    }),
});

const idParamSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});

const fetchTestCasesSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    suite: z.string().uuid(),
    search: z.string().optional(),
  }),
});

module.exports = {
  createTestCaseSchema,
  updateTestCaseSchema,
  idParamSchema,
  fetchTestCasesSchema,
};
