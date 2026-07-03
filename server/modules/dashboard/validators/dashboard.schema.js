// modules/dashboard/validators/dashboard.schema.js
const { z } = require("zod");

const overviewSchema = z.object({
  query: z.object({
    projectId: z.string().uuid().optional(),
  }),
});

const recentRunsSchema = z.object({
  query: z.object({
    projectId: z.string().uuid().optional(),
    suiteId: z.string().uuid().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(10),
  }),
});

module.exports = { overviewSchema, recentRunsSchema };
