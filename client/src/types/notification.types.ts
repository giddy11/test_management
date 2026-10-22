export type NotificationType =
  | "test_assigned"
  | "run_completed"
  | "project_member_added"
  | "feature_request_new"
  | "feature_request_status_changed"
  | "feature_request_comment"
  | "feature_request_assigned"
  | "bug_reported"
  | "bug_assigned"
  | "bug_status_changed"
  | "bug_comment"
  | "bug_mention"
  | "feature_request_mention"
  | "feedback_new"
  | "feedback_assigned"
  | "feedback_confirmed"
  | "feedback_closed_supporter"
  | "support_item_assigned"
  | "support_chat_message"
  | "support_chat_reply"
  | "service_request_approval"
  | "service_request_queued"
  | "service_request_update"
  | "service_request_escalated"
  | "sla_escalated"

export interface AppNotification {
  id: string
  type: NotificationType
  title: string
  body: string | null
  data: {
    caseId?: string
    suiteId?: string
    projectId?: string
    runId?: string
    requestId?: string
    bugId?: string
    feedbackId?: string
    role?: string
    status?: string
    // Set on notifications meant for the IT support portal (/support) rather
    // than the internal /projects views — see NotificationBell's linkFor.
    support?: boolean
    // IT requests (/requests/:id) — not to be confused with requestId, a feature request.
    serviceRequestId?: string
  } | null
  read: boolean
  createdAt: string
}
