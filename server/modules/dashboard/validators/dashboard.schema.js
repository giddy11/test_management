// modules/dashboard/validators/dashboard.schema.js
const { z } = require("zod");

const overviewSchema = z.object({
  query: z.object({
    projectId: z.string().uuid().optional(),
  }),
});

module.exports = { overviewSchema };
