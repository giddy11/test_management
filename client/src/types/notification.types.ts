export type NotificationType = "test_assigned" | "run_completed"

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
  } | null
  read: boolean
  createdAt: string
}
