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
  targets: SlaTargets
  // Stages during which the SLA clock is paused (never "logged").
  pausedStatuses: string[]
  // True when the organisation hasn't saved its own rules yet.
  isDefault: boolean
  updatedAt: string | null
  canEdit: boolean
}

export interface UpdateSlaSettingsPayload {
  targets: SlaTargets
  pausedStatuses: string[]
}

// Unified stage: the product lifecycle plus the IT tier's "escalated".
export type SlaStage =
  | "logged"
  | "acknowledged"
  | "assigned"
  | "investigating"
  | "resolved"
  | "closed"
  | "escalated"

export type SlaSeverityFilter = FeedbackSeverity | "unset"

export type SlaInterval = "day" | "week" | "month"

export interface SlaFilters {
  from?: string // YYYY-MM-DD
  to?: string
  projectId?: string
  clientCompanyId?: string
  status?: SlaStage
  severity?: SlaSeverityFilter
  type?: FeedbackType
  assigneeId?: string
  supporterId?: string
  search?: string
  interval?: SlaInterval
}

export type SlaMetric =
  | "all"
  | "open"
  | "resolved"
  | "closed"
  | "breached"
  | "compliant"
  | "pending"
  | "awaiting_response"
  | "first_response_breached"
  | "resolution_breached"

export type SlaCompliance = "met" | "breached" | "pending"

export interface SlaKpis {
  total: number
  bugs: number
  featureRequests: number
  complaints: number
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
  bugs: number
  featureRequests: number
  complaints: number
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
  firstResponseTargetMs: number
  resolutionTargetMs: number
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

export interface SlaRecurringRow {
  title: string
  type: FeedbackType
  projectId: string
  projectName: string
  count: number
  open: number
  breached: number
  firstSeenAt: string
  lastSeenAt: string
}

export interface SlaOverview {
  interval: SlaInterval
  rules: { targets: SlaTargets; pausedStatuses: string[]; isDefault: boolean }
  kpis: SlaKpis
  overTime: SlaOverTimePoint[]
  bySeverity: SlaSeverityRow[]
  byStatus: SlaStatusRow[]
  byType: SlaTypeRow[]
  byProject: SlaProjectRow[]
  byAssignee: SlaPersonRow[]
  bySupporter: SlaPersonRow[]
  recurring: SlaRecurringRow[]
}

// A ticket row in the drill-down list, with its SLA readings.
export interface SlaTicket {
  id: string
  ticketNumber: number
  title: string
  type: FeedbackType
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

export const SLA_STAGE_LABELS: Record<SlaStage, string> = {
  logged: "Logged",
  acknowledged: "Acknowledged",
  assigned: "Assigned",
  investigating: "Investigating",
  resolved: "Resolved",
  closed: "Closed",
  escalated: "Escalated",
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
  all: "All tickets",
  open: "Open tickets",
  resolved: "Resolved tickets",
  closed: "Closed tickets",
  breached: "SLA breached",
  compliant: "SLA compliant",
  pending: "Within SLA (open)",
  awaiting_response: "Awaiting first response",
  first_response_breached: "First response breached",
  resolution_breached: "Resolution breached",
}
