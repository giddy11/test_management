// modules/ticketLink/validators/ticketLink.schema.js
const { z } = require("zod");
const { enums } = require("../../../config/constants");

const ticketType = z.enum(enums.ticketType);
const linkType = z.enum(enums.ticketLinkType);

// GET /ticket-links?type=&id= — every link on one ticket.
const fetchLinksSchema = z.object({
  query: z.object({
    type: ticketType,
    id: z.string().uuid(),
  }),
});

// GET /ticket-links/summary?projectId=&type=&ids=a,b,c — the badges for a list page.
const summarySchema = z.object({
  query: z.object({
    projectId: z.string().uuid(),
    type: ticketType,
    ids: z
      .string()
      .transform((s) => s.split(",").map((v) => v.trim()).filter(Boolean))
      .pipe(z.array(z.string().uuid()).min(1).max(100)),
  }),
});

// Both lookups below can be asked about a ticket that already exists (so it is
// left out of its own results) — both fields or neither.
const excludeFields = {
  excludeType: ticketType.optional(),
  excludeId: z.string().uuid().optional(),
};
const excludeBoth = (q) => (q.excludeType === undefined) === (q.excludeId === undefined);
const excludeMessage = { message: "excludeType and excludeId go together" };

// GET /ticket-links/similar?projectId=&title= — past tickets that read like a title.
const similarSchema = z.object({
  query: z
    .object({
      projectId: z.string().uuid(),
      title: z.string().max(200).default(""),
      ...excludeFields,
    })
    .refine(excludeBoth, excludeMessage),
});

// GET /ticket-links/candidates?projectId=&q= — the link picker's search box.
const candidatesSchema = z.object({
  query: z
    .object({
      projectId: z.string().uuid(),
      q: z.string().max(200).default(""),
      ...excludeFields,
    })
    .refine(excludeBoth, excludeMessage),
});

const createLinkSchema = z.object({
  body: z.object({
    sourceType: ticketType,
    sourceId: z.string().uuid(),
    targetType: ticketType,
    targetId: z.string().uuid(),
    // `duplicate`: the source is a repeat of the target. `related`: no direction.
    linkType,
  }),
});

const idParamSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});

module.exports = {
  fetchLinksSchema,
  summarySchema,
  similarSchema,
  candidatesSchema,
  createLinkSchema,
  idParamSchema,
};
