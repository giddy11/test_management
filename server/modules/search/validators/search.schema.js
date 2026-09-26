const { z } = require("zod");

const searchSchema = z.object({
  query: z.object({
    q: z.string().max(200).default(""),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  }),
});

module.exports = { searchSchema };
