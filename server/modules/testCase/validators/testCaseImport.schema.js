// modules/testCase/validators/testCaseImport.schema.js
const { z } = require("zod");
const { enums } = require("../../../config/constants");

// Non-file fields for the upload step.
const importUploadSchema = z.object({
  body: z.object({ suiteId: z.string().uuid() }),
});

const importIdParamSchema = z.object({
  params: z.object({ importId: z.string().uuid() }),
});

const importConfirmSchema = z.object({
  params: z.object({ importId: z.string().uuid() }),
});

// Validates one parsed spreadsheet row.
const importRowSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  steps: z.array(z.string().min(1)).min(1),
  expectedResult: z.string().min(1),
  priority: z.enum(enums.testCasePriority),
  status: z.enum(enums.testCaseStatus).default("Draft"),
  tags: z.array(z.string()).optional(),
});

module.exports = {
  importUploadSchema,
  importIdParamSchema,
  importConfirmSchema,
  importRowSchema,
};
