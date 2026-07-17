export type FeedbackType = "feature_request" | "bug" | "complaint"

// How a ticket was created — the public browser form, or a partner's
// server-to-server integration (see IntegrationApiKeyDialog / partner docs).
export type FeedbackSource = "public_form" | "integration"

export type FeedbackStatus =
  | "logged"
  | "acknowledged"
  | "assigned"
  | "investigating"
  | "resolved"
  | "awaiting_confirmation"
  | "closed"

// IT-tier lifecycle for items submitted through a client company's form —
// null for direct (project-token) submissions. Strictly sequential through
// the working stages; resolved/escalated are terminal outcomes reached only
// from "investigating".
export type SupportStatus =
  | "logged"
  | "acknowledged"
  | "investigating"
  | "resolved"
  | "escalated"

// Set by IT support when they escalate an item — tells the product team how
// urgent it is. Null until escalated.
export type FeedbackSeverity = "low" | "medium" | "high" | "critical"

export interface Feedback {
  id: string
  // Human-readable sequential id shown everywhere instead of the uuid.
  ticketNumber: number
  projectId: string
  // Present when the backend loaded the project relation (global view).
  projectName: string | null
  source: FeedbackSource
  // The partner's own correlation id — set only on integration-sourced tickets.
  externalRef: string | null
  clientCompanyId: string | null
  clientCompanyName: string | null
  supportStatus: SupportStatus | null
  supportResponse: string | null
  supportResolvedAt: string | null
  escalatedAt: string | null
  escalatedByName: string | null
  // Set by an IT support lead to route this item to a specific teammate —
  // independent of supportStatus.
  assignedSupporterId: string | null
  assignedSupporterName: string | null
  severity: FeedbackSeverity | null
  // Set once IT support has told the original end user an escalated item was
  // fixed — a deliberate relay step, not automatic. Null until they do.
  submitterNotifiedAt: string | null
  type: FeedbackType
  title: string
  description: string
  suiteName: string | null
  submitterName: string
  submitterEmail: string
  submitterPhone: string | null
  status: FeedbackStatus
  assignees: { id: string; name: string }[]
  adminResponse: string | null
  reopenReason: string | null
  attachments: { id: string; url: string }[]
  statusUpdatedAt: string | null
  createdAt: string
}

export interface FetchFeedbackParams {
  // Omitted => cross-project view, scoped by role on the backend.
  projectId?: string
  page?: number
  limit?: number
  status?: FeedbackStatus
  type?: FeedbackType
  search?: string
}

export interface SupportQueueParams {
  page?: number
  limit?: number
  supportStatus?: SupportStatus
  type?: FeedbackType
  search?: string
  assignedSupporterId?: string
  unassigned?: boolean
}

export interface ManageFeedbackPayload {
  status?: FeedbackStatus
  assignedToIds?: string[]
  adminResponse?: string | null
}

export interface SubmitPublicFeedbackPayload {
  type: FeedbackType
  title: string
  description: string
  suiteName?: string
  submitterName: string
  submitterEmail: string
  submitterPhone?: string
  images?: File[]
}

export interface PublicFeedbackForm {
  projectName: string
  // Set when the form link belongs to a client company — their IT support
  // triages the submission first.
  clientCompanyName: string | null
  suites: { id: string; name: string }[]
}

// Context for the public confirmation page reached from the "awaiting
// confirmation" status email. `status` lets the page tell whether the link
// is still actionable — it may have already been used, or moved on since.
export interface FeedbackConfirmationContext {
  projectName: string
  ticketNumber: number
  title: string
  status: FeedbackStatus
  feedbackToken: string | null
}

// One entry per lifecycle stage entered, oldest first — used to render a
// duration-per-stage timeline. `enteredAt` of the current (last) stage marks
// where an ongoing duration is measured from.
export interface FeedbackStatusHistoryEntry {
  status: FeedbackStatus
  enteredAt: string
}

export const FEEDBACK_STATUSES: FeedbackStatus[] = [
  "logged",
  "acknowledged",
  "assigned",
  "investigating",
  "resolved",
  "awaiting_confirmation",
  "closed",
]

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  logged: "Logged",
  acknowledged: "Acknowledged",
  assigned: "Assigned",
  investigating: "Investigating",
  resolved: "Resolved",
  awaiting_confirmation: "Awaiting confirmation",
  closed: "Closed",
}

export const FEEDBACK_TYPE_LABELS: Record<FeedbackType, string> = {
  feature_request: "Feature request",
  bug: "Bug",
  complaint: "Complaint",
}

export const FEEDBACK_SOURCE_LABELS: Record<FeedbackSource, string> = {
  public_form: "Public form",
  integration: "Via API",
}

export const SUPPORT_STATUSES: SupportStatus[] = [
  "logged",
  "acknowledged",
  "investigating",
  "resolved",
  "escalated",
]

// The stages a supporter advances through manually — the two terminal
// outcomes are reached via the resolve/escalate actions instead.
export const SUPPORT_PROGRESSION: SupportStatus[] = ["logged", "acknowledged", "investigating"]

export const SUPPORT_STATUS_LABELS: Record<SupportStatus, string> = {
  logged: "Logged",
  acknowledged: "Acknowledged",
  investigating: "Investigating",
  resolved: "Resolved locally",
  escalated: "Escalated",
}

export const FEEDBACK_SEVERITIES: FeedbackSeverity[] = ["low", "medium", "high", "critical"]

export const FEEDBACK_SEVERITY_LABELS: Record<FeedbackSeverity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
}
