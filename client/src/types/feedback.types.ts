export type FeedbackType = "feature_request" | "bug" | "complaint"

export type FeedbackStatus =
  | "logged"
  | "acknowledged"
  | "assigned"
  | "investigating"
  | "resolved"
  | "awaiting_confirmation"
  | "closed"

export interface Feedback {
  id: string
  projectId: string
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
  projectId: string
  page?: number
  limit?: number
  status?: FeedbackStatus
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
