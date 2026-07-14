export type FeedbackType = "feature_request" | "bug" | "complaint"

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

export interface Feedback {
  id: string
  projectId: string
  // Present when the backend loaded the project relation (global view).
  projectName: string | null
  clientCompanyId: string | null
  clientCompanyName: string | null
  supportStatus: SupportStatus | null
  supportResponse: string | null
  supportResolvedAt: string | null
  escalatedAt: string | null
  escalatedByName: string | null
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
