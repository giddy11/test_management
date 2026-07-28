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
// from "investigating". "resolved" itself is only reached by the submitter
// confirming via "awaiting_confirmation" — not set directly.
export type SupportStatus =
  | "logged"
  | "acknowledged"
  | "investigating"
  | "awaiting_confirmation"
  | "resolved"
  | "escalated"

// Set by IT support when they escalate an item — tells the product team how
// urgent it is. Null until escalated.
export type FeedbackSeverity = "low" | "medium" | "high" | "critical"

export interface Feedback {
  id: string
  // Human-readable sequential id shown everywhere instead of the uuid.
  ticketNumber: number
  // Formatted "TKT-YYYYMMDD-NNN" code — display this instead of ticketNumber.
  ticketCode: string
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
  // Denormalized — comments live in their own thread, see FeedbackComment below.
  commentCount: number
  statusUpdatedAt: string | null
  createdAt: string
}

export interface FeedbackCommentAttachment {
  id: string
  fileName: string
  fileUrl: string
  mimeType: string
  fileSizeBytes: number
}

// A message in a ticket's comment thread — either an internal staff member
// (authorId set) or the ticket's submitter (no account — authorId is null,
// authorType is "submitter").
export interface FeedbackComment {
  id: string
  feedbackId: string
  authorType: "staff" | "submitter"
  authorId: string | null
  authorName: string
  body: string
  attachments: FeedbackCommentAttachment[]
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
// confirmation" status email. Serves both the product and IT-support tiers
// (whichever is driving this ticket), so `status` is the same collapsed,
// customer-facing value the "My Tickets" lookup uses — the page just checks
// for "pending_your_confirmation" to tell whether the link is still actionable.
export interface FeedbackConfirmationContext {
  projectName: string
  ticketNumber: number
  ticketCode: string
  title: string
  status: MyTicketStatus
  feedbackToken: string | null
}

// One entry per lifecycle stage entered, oldest first — used to render a
// duration-per-stage timeline. `enteredAt` of the current (last) stage marks
// where an ongoing duration is measured from.
export interface FeedbackStatusHistoryEntry {
  status: FeedbackStatus
  enteredAt: string
}

// A collapsed, customer-facing status returned by the "my tickets" lookup —
// internal triage granularity is hidden, and "resolved" isn't shown as done
// until the submitter has confirmed it (see server's toSubmitterStatus).
export type MyTicketStatus = "received" | "in_progress" | "pending_your_confirmation" | "resolved"

export const MY_TICKET_STATUS_LABELS: Record<MyTicketStatus, string> = {
  received: "Received",
  in_progress: "In progress",
  pending_your_confirmation: "Awaiting your confirmation",
  resolved: "Resolved",
}

// One row in a submitter's own ticket history (no account — email + one-time
// code). Deliberately thinner than Feedback: no internal fields.
export interface MyTicket {
  id: string
  ticketNumber: number
  ticketCode: string
  projectName: string | null
  clientCompanyName: string | null
  type: FeedbackType
  title: string
  status: MyTicketStatus
  // The latest note that was actually emailed to this submitter, if any —
  // never the internal note IT support leaves the product team on escalation.
  note: string | null
  // The same public form this ticket originally came through (project's or
  // client company's) — null if that link has since been disabled. Lets the
  // submitter raise another ticket for the same product from here.
  feedbackToken: string | null
  createdAt: string
  updatedAt: string
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
  "awaiting_confirmation",
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
  awaiting_confirmation: "Awaiting the submitter's confirmation",
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
