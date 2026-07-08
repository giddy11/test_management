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
    role?: string
    status?: string
  } | null
  read: boolean
  createdAt: string
}
