// modules/sla/validators/sla.schema.ts
import { z } from "zod";

const { enums } = require("../../../config/constants");

// Unified stage keys — the product-tier lifecycle plus the IT tier's extra
// terminal state (a company ticket still in its IT queue reports its
// supportStatus as its stage; see SlaRepository's `stage` column), plus bug
// and feature-request statuses (their `stage` is just their raw status).
export const SLA_STAGES: string[] = [
  ...new Set([...enums.feedbackStatus, ...enums.supportStatus, ...enums.bugStatus, ...enums.featureRequestStatus]),
];

export const SLA_SOURCES = ["ticket", "bug", "feature_request"] as const;

// Severity filter also accepts "unset" — tickets IT support hasn't escalated
// (or direct submissions) carry no severity and fall under the default target.
export const SLA_SEVERITY_FILTERS: string[] = [...enums.feedbackSeverity, "unset"];

export const SLA_METRICS = [
  "all",
  "open",
  "resolved",
  "closed",
  "breached",
  "compliant",
  "judged",
  "pending",
  "awaiting_response",
  "first_response_breached",
  "resolution_breached",
] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

// Shared by every analytics endpoint — every figure on the dashboard and the
// drill-down list are computed over the same filtered ticket set.
const filterFields = {
  from: isoDate.optional(),
  to: isoDate.optional(),
  projectId: z.string().uuid().optional(),
  clientCompanyId: z.string().uuid().optional(),
  status: z.enum(SLA_STAGES as [string, ...string[]]).optional(),
  severity: z.enum(SLA_SEVERITY_FILTERS as [string, ...string[]]).optional(),
  type: z.enum(enums.feedbackType).optional(),
  source: z.enum(SLA_SOURCES).optional(),
  // Product-team member the ticket is assigned to.
  assigneeId: z.string().uuid().optional(),
  // IT support engineer the ticket is routed to.
  supporterId: z.string().uuid().optional(),
  search: z.string().trim().max(200).optional(),
};

export const slaFiltersSchema = z.object({
  query: z
    .object({
      ...filterFields,
      interval: z.enum(["day", "week", "month"]).optional(),
    })
    .refine((q) => !q.from || !q.to || q.from <= q.to, {
      message: "'from' must be on or before 'to'",
      path: ["from"],
    }),
});

export const slaTicketsSchema = z.object({
  query: z
    .object({
      ...filterFields,
      metric: z.enum(SLA_METRICS).default("all"),
      sort: z.enum(["newest", "oldest", "longest_waiting"]).default("newest"),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20),
    })
    .refine((q) => !q.from || !q.to || q.from <= q.to, {
      message: "'from' must be on or before 'to'",
      path: ["from"],
    }),
});

const targetSchema = z.object({
  // Fractions of an hour are allowed (e.g. 0.5 = 30 minutes).
  firstResponseHours: z.number().positive().max(24 * 365),
  resolutionHours: z.number().positive().max(24 * 365),
});

export const updateSlaSettingsSchema = z.object({
  body: z.object({
    targets: z.object({
      default: targetSchema,
      low: targetSchema,
      medium: targetSchema,
      high: targetSchema,
      critical: targetSchema,
    }),
    // Bugs are judged by priority (Urgent counts as "critical"), so they have
    // no "default" row. Null = follow the ticket targets.
    bugTargets: z
      .object({
        low: targetSchema,
        medium: targetSchema,
        high: targetSchema,
        critical: targetSchema,
      })
      .nullable()
      .default(null),
    // Feature requests have no severity, so one target covers them all.
    featureRequestTarget: targetSchema.nullable().default(null),
    // An issue's very first stage (feedback: "logged", bugs: "Open",
    // feature requests: "new") can never pause — nothing has happened yet,
    // so pausing there would hide the wait the SLA exists to measure.
    pausedStatuses: z
      .array(
        z.enum(
          SLA_STAGES.filter((s) => !["logged", "Open", "new"].includes(s)) as [string, ...string[]]
        )
      )
      .max(10)
      .default([]),
  }),
});

export type SlaFilters = z.infer<typeof slaFiltersSchema>["query"];
export type SlaTicketsQuery = z.infer<typeof slaTicketsSchema>["query"];
export type UpdateSlaSettingsBody = z.infer<typeof updateSlaSettingsSchema>["body"];
