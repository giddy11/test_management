// modules/notification/validators/notification.schema.js
const { z } = require("zod");

const fetchNotificationsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  }),
});

const idParamSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});

module.exports = { fetchNotificationsSchema, idParamSchema };
