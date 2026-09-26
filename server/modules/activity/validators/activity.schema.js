// modules/activity/validators/activity.schema.js
const { z } = require("zod");
const { SEVERITIES } = require("../catalog/severity.catalog");

// The filter bar, shared by the list and the export. Only the list paginates,
// so the export schema is the same object minus page/limit.
const filters = {
  search: z.string().trim().min(1).max(120).optional(),
  action: z.string().max(60).optional(),
  entityType: z.string().max(40).optional(),
  actorId: z.string().uuid().optional(),
  severity: z.enum(SEVERITIES).optional(),
};

const fetchActivitySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    // 100 is the largest rows-per-page the UI offers.
    limit: z.coerce.number().int().min(1).max(100).default(30),
    ...filters,
  }),
});

const exportActivitySchema = z.object({
  query: z.object(filters),
});

module.exports = { fetchActivitySchema, exportActivitySchema };
