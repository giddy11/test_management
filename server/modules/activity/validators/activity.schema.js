// modules/activity/validators/activity.schema.js
const { z } = require("zod");

const fetchActivitySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(30),
    action: z.string().optional(),
  }),
});

module.exports = { fetchActivitySchema };
