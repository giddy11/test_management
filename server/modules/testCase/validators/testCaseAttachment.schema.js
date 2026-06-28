// modules/testCase/validators/testCaseAttachment.schema.js
const { z } = require("zod");

const testCaseIdParamSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});

const attachmentParamsSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
    attachmentId: z.string().uuid(),
  }),
});

module.exports = { testCaseIdParamSchema, attachmentParamsSchema };
