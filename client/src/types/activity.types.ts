export interface ActivityLog {
  id: string
  action: string
  summary: string
  entityType: string | null
  entityId: string | null
  actor: { id: string; name: string; email: string } | null
  createdAt: string
}
