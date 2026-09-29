// types/sla.types.ts — SLA tracking dashboard (mirrors server/modules/sla).
import type { FeedbackSeverity, FeedbackType } from "./feedback.types"

// Severity keys the SLA targets are configured for. "default" covers tickets
// with no severity (direct submissions, or not yet escalated by IT support).
export type SlaSeverityKey = FeedbackSeverity | "default"

export interface SlaTarget {
  firstResponseHours: number
  resolutionHours: number
}

export type SlaTargets = Record<SlaSeverityKey, SlaTarget>

export interface SlaSettings {
  // Ticket targets — also what bugs and feature requests follow until an admin
  // gives them their own (see the separate* flags).
  targets: SlaTargets
  // What bugs are judged against, keyed by priority mapped to a severity key
  // (Urgent → "critical"). Equals `targets` while separateBugTargets is false.
  bugTargets: SlaTargets
  // What feature requests are judged against (they carry no severity).
  featureRequestTarget: SlaTarget
  separateBugTargets: boolean
  separateFeatureRequestTarget: boolean
  // Stages during which the SLA clock is paused (never "logged").
  pausedStatuses: string[]
  // True when the organisation hasn't saved its own rules yet.
  isDefault: boolean
  updatedAt: string | null
  canEdit: boolean
}

// Bugs have no "default" row — every bug has a priority.
export type SlaBugTargets = Record<Exclude<SlaSeverityKey, "default">, SlaTarget>

export interface UpdateSlaSettingsPayload {
  targets: SlaTargets
  // null = follow the ticket targets.
  bugTargets: SlaBugTargets | null
  featureRequestTarget: SlaTarget | null
  pausedStatuses: string[]
}

// Unified stage: the ticket product lifecycle plus the IT tier's
// "escalated", or — for bug/feature-request rows — that source's own raw
// status (e.g. "Fixed", "planned"). Kept as a plain string since it now
// spans three status vocabularies; SLA_STAGE_LABELS covers the known ones
// and callers fall back to the raw value for anything else.
export type SlaStage = string

export type SlaSeverityFilter = FeedbackSeverity | "unset"

export type SlaInterval = "day" | "week" | "month" | "year"

// Top-level kind an SLA row comes from. Distinct from FeedbackType (`type`),
// which is a sub-category that only exists on ticket rows.
export type SlaSource = "ticket" | "bug" | "feature_request"

export const SLA_SOURCE_LABELS: Record<SlaSource, string> = {
  ticket: "Ticket",
  bug: "Bug",
  feature_request: "Feature request",
}

export interface SlaFilters {
  from?: string // YYYY-MM-DD
  to?: string
  projectId?: string
  clientCompanyId?: string
  status?: SlaStage
  severity?: SlaSeverityFilter
  type?: FeedbackType
  source?: SlaSource
  assigneeId?: string
  supporterId?: string
  search?: string
  interval?: SlaInterval
  // Drill-down only: the reports of one row of "Most recurring issues". Opaque —
  // handed back exactly as the overview gave it (SlaRecurringRow.groupKey).
  recurringKey?: string
}

export type SlaMetric =
  | "all"
  | "open"
  | "resolved"
  | "closed"
  | "breached"
  | "compliant"
  | "judged"
  | "pending"
  | "awaiting_response"
  | "first_response_breached"
  | "resolution_breached"

export type SlaCompliance = "met" | "breached" | "pending"

export interface SlaKpis {
  total: number
  // Per-source counts (see SlaSource) — replaces feedback's own bug/feature
  // request/complaint sub-category breakdown, which only ever covered
  // ticket rows submitted through the feedback form.
  tickets: number
  bugs: number
  featureRequests: number
  resolved: number
  closed: number
  open: number
  awaitingResponse: number
  responded: number
  avgFirstResponseMs: number | null
  medianFirstResponseMs: number | null
  avgResolutionMs: number | null
  medianResolutionMs: number | null
  firstResponseMet: number
  firstResponseBreached: number
  resolutionMet: number
  resolutionBreached: number
  slaMet: number
  slaBreached: number
  slaPending: number
  avgWaitingMs: number | null
  oldestWaitingMs: number | null
  totalPausedMs: number | null
  avgRating: number | null
  ratingCount: number
  // Percentages (0-100, one decimal) over judged tickets only; null when
  // nothing has been judged yet.
  firstResponseRate: number | null
  resolutionRate: number | null
  complianceRate: number | null
}

export interface SlaOverTimePoint {
  period: string // YYYY-MM-DD bucket start
  tickets: number
  bugs: number
  featureRequests: number
  total: number
  resolved: number
  breached: number
}

export interface SlaSeverityRow {
  severity: SlaSeverityFilter
  total: number
  open: number
  resolved: number
  met: number
  breached: number
  pending: number
  avgFirstResponseMs: number | null
  avgResolutionMs: number | null
}

export interface SlaStatusRow {
  status: SlaStage
  count: number
  breached: number
}

export interface SlaTypeRow {
  type: FeedbackType
  total: number
  resolved: number
  breached: number
  avgResolutionMs: number | null
}

export interface SlaProjectRow {
  projectId: string
  projectName: string
  total: number
  open: number
  resolved: number
  met: number
  breached: number
  avgFirstResponseMs: number | null
  avgResolutionMs: number | null
}

export interface SlaPersonRow {
  userId: string
  name: string
  clientCompanyName?: string | null
  total: number
  open: number
  resolved: number
  met: number
  breached: number
  avgFirstResponseMs: number | null
  avgResolutionMs: number | null
}

export interface SlaSourceRow {
  source: SlaSource
  total: number
  resolved: number
  breached: number
  avgResolutionMs: number | null
}

// One problem that has been raised more than once — a bug, a ticket or a feature
// request, together with every repeat of it (see the server's occurrenceKeySql).
export interface SlaRecurringRow {
  // Opaque id of the group; pass it back as SlaFilters.recurringKey to list its reports.
  groupKey: string
  // The group's kind is its original's, so a customer ticket linked to a known bug
  // counts toward that bug.
  source: SlaSource
  // The original's title (or, for identical titles, the earliest report's).
  title: string
  referenceCode: string
  // The ticket to open, and which kind it is (may differ from `source` when the
  // original has since been deleted and the earliest report stands in).
  ticketId: string
  ticketSource: SlaSource
  projectId: string
  projectName: string
  // Reports in the selected range, counting the original.
  count: number
  open: number
  resolved: number
  breached: number
  // Reports filed AFTER the problem had already been resolved once — "it came back".
  afterFix: number
  // Feature requests: upvotes across the group. Null for the other kinds.
  votes: number | null
  avgResolutionMs: number | null
  firstSeenAt: string
  lastSeenAt: string
  // true = grouped by links the team made; false = grouped because titles are identical.
  linked: boolean
}

export interface SlaOverview {
  interval: SlaInterval
  rules: { targets: SlaTargets; pausedStatuses: string[]; isDefault: boolean }
  kpis: SlaKpis
  overTime: SlaOverTimePoint[]
  bySeverity: SlaSeverityRow[]
  byStatus: SlaStatusRow[]
  byType: SlaTypeRow[]
  bySource: SlaSourceRow[]
  byProject: SlaProjectRow[]
  byAssignee: SlaPersonRow[]
  bySupporter: SlaPersonRow[]
  recurring: SlaRecurringRow[]
}

// A row in the drill-down list (a ticket, bug, or feature request), with its
// SLA readings.
export interface SlaTicket {
  id: string
  source: SlaSource
  referenceNumber: number
  // Already formatted with the right prefix (TKT-/BF-/FR-) for the source.
  referenceCode: string
  title: string
  // Feedback's own sub-category — only meaningful when source === "ticket".
  type: FeedbackType | null
  status: string
  supportStatus: string | null
  stage: SlaStage
  severity: FeedbackSeverity | null
  projectId: string
  projectName: string
  clientCompanyId: string | null
  clientCompanyName: string | null
  submitterName: string
  suiteName: string | null
  rating: number | null
  createdAt: string
  firstResponseAt: string | null
  resolvedAt: string | null
  closedAt: string | null
  firstResponseMs: number | null
  resolutionMs: number | null
  pausedMs: number
  ageMs: number
  sinceUpdateMs: number
  firstResponseTargetMs: number
  resolutionTargetMs: number
  firstResponseDueAt: string
  resolutionDueAt: string
  firstResponseBreached: boolean
  resolutionBreached: boolean
  compliance: SlaCompliance
  isResolved: boolean
  assignees: string[]
  supporterName: string | null
  // False for company tickets the product org can't open yet (still in the
  // IT queue, not escalated).
  visibleInTriage: boolean
}

export interface SlaTicketsParams extends SlaFilters {
  metric?: SlaMetric
  sort?: "newest" | "oldest" | "longest_waiting"
  page?: number
  limit?: number
}

export interface SlaFilterOptions {
  projects: { id: string; name: string }[]
  companies: { id: string; name: string }[]
  assignees: { id: string; name: string }[]
  supporters: { id: string; name: string }[]
}

// Ticket stages, plus bugs' and feature requests' own raw statuses — every
// value SlaStage/`stage` can take across all three sources. A status this
// map doesn't cover (shouldn't happen, but new enum values ship faster than
// this dashboard) just falls back to its raw value — see fmtStage below.
export const SLA_STAGE_LABELS: Record<string, string> = {
  // Tickets (feedback lifecycle + IT tier).
  logged: "Logged",
  acknowledged: "Acknowledged",
  assigned: "Assigned",
  investigating: "Investigating",
  resolved: "Resolved",
  closed: "Closed",
  escalated: "Escalated",
  // Bugs. "In Progress" and "Closed" also exist on another source, so those
  // two carry a suffix — otherwise a chart or checklist would show two
  // indistinguishable "In Progress" / "Closed" entries.
  Open: "Open",
  "In Progress": "In Progress (bug)",
  Fixed: "Fixed",
  Verified: "Verified",
  Closed: "Closed (bug)",
  Reopened: "Reopened",
  // Feature requests.
  new: "New",
  under_review: "Under Review",
  planned: "Planned",
  in_progress: "In Progress (feature)",
  done: "Done",
  rejected: "Rejected",
}

export function fmtStage(stage: string): string {
  return SLA_STAGE_LABELS[stage] ?? stage
}

export const SLA_STAGES: SlaStage[] = [
  "logged",
  "acknowledged",
  "assigned",
  "investigating",
  "escalated",
  "resolved",
  "closed",
]

// Every stage across all three sources, for a status filter that isn't
// scoped to one source.
export const SLA_ALL_STAGES: SlaStage[] = [
  ...SLA_STAGES,
  "Open",
  "In Progress",
  "Fixed",
  "Verified",
  "Closed",
  "Reopened",
  "new",
  "under_review",
  "planned",
  "in_progress",
  "done",
  "rejected",
]

export const SLA_SEVERITY_FILTER_LABELS: Record<SlaSeverityFilter, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  unset: "Not set",
}

export const SLA_SEVERITY_KEY_LABELS: Record<SlaSeverityKey, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  default: "No severity (default)",
}

export const SLA_METRIC_LABELS: Record<SlaMetric, string> = {
  all: "All issues",
  open: "Open issues",
  resolved: "Resolved issues",
  closed: "Closed issues",
  breached: "SLA breached",
  compliant: "SLA met",
  judged: "SLA compliance — met and breached",
  pending: "Within SLA (open)",
  awaiting_response: "Awaiting first response",
  first_response_breached: "First response breached",
  resolution_breached: "Resolution breached",
}
