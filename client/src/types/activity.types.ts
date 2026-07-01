export interface ActivityLog {
  id: string
  action: string
  summary: string
  entityType: string | null
  entityId: string | null
  metadata: Record<string, string | null> | null
  actor: { id: string; name: string; email: string } | null
  createdAt: string
}
