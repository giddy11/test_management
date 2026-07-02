// modules/featureRequest/validators/featureRequestAttachment.schema.js
const { z } = require("zod");

const featureRequestIdParamSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});

const attachmentParamsSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
    attachmentId: z.string().uuid(),
  }),
});

module.exports = { featureRequestIdParamSchema, attachmentParamsSchema };
