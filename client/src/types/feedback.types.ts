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
  status: FeedbackStatus
  assignedTo: { id: string; name: string } | null
  adminResponse: string | null
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
  assignedToId?: string | null
  adminResponse?: string | null
}

export interface SubmitPublicFeedbackPayload {
  type: FeedbackType
  title: string
  description: string
  suiteName?: string
  submitterName: string
  submitterEmail: string
  images?: File[]
}

export interface PublicFeedbackForm {
  projectName: string
  suites: { id: string; name: string }[]
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
