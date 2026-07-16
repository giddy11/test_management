export type NotificationType =
  | "test_assigned"
  | "run_completed"
  | "project_member_added"
  | "feature_request_new"
  | "feature_request_status_changed"
  | "feature_request_comment"
  | "bug_reported"
  | "bug_assigned"
  | "bug_status_changed"
  | "feedback_new"
  | "feedback_assigned"
  | "feedback_confirmed"
  | "feedback_closed_supporter"
  | "support_chat_message"
  | "support_chat_reply"

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
  } | null
  read: boolean
  createdAt: string
}
