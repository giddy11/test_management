// modules/emailLog/validators/emailLog.schema.ts
import { z } from "zod";
import { EMAIL_PROVIDER_CODES } from "../../../shared/utils/mail/emailProviders";
import { EMAIL_LOG_STATUSES } from "../domain/emailLogRow";
import { NO_PROVIDER } from "../domain/emailLogQuery";

// An ISO 8601 timestamp that says which instant it means: "…Z" or "…+01:00".
// A bare "2026-11-23T00:00:00" would be read in the SERVER's time zone, which is
// never what an admin looking at their own clock meant, so it is refused.
const instant = z
  .string()
  .datetime({ offset: true, message: "Expected an ISO timestamp with a time-zone offset" })
  .transform((value) => new Date(value));

// Everything the tiles and the table share. `status` is the one the summary
// leaves out, so it is added to the list's filters only.
const sharedFilters = {
  kind: z.string().trim().min(1).max(40).optional(),
  // A provider code, or "none" for emails no provider was ever chosen for.
  provider: z.enum([...EMAIL_PROVIDER_CODES, NO_PROVIDER]).optional(),
  organizationId: z.string().uuid().optional(),
  search: z.string().trim().min(1).max(120).optional(),
  // from is inclusive, to is exclusive: [from, to).
  from: instant.optional(),
  to: instant.optional(),
};

const fromBeforeTo = (q: { from?: Date; to?: Date }) => !q.from || !q.to || q.from.getTime() < q.to.getTime();
const fromBeforeToIssue = { message: "'from' must be earlier than 'to'", path: ["from"] };

export const listEmailLogSchema = z.object({
  query: z
    .object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(25),
      status: z.enum(EMAIL_LOG_STATUSES).optional(),
      ...sharedFilters,
    })
    .refine(fromBeforeTo, fromBeforeToIssue),
});

export const summaryEmailLogSchema = z.object({
  query: z.object(sharedFilters).refine(fromBeforeTo, fromBeforeToIssue),
});
