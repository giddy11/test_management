// modules/bug/validators/bugAttachment.schema.js
const { z } = require("zod");

const bugIdParamSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});

const attachmentParamsSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
    attachmentId: z.string().uuid(),
  }),
});

module.exports = { bugIdParamSchema, attachmentParamsSchema };
