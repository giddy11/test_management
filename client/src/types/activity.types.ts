import type { AuditSeverity } from "@/lib/enums"

export interface ActivityLog {
  id: string
  action: string
  summary: string
  severity: AuditSeverity
  entityType: string | null
  entityId: string | null
  // Free-form per action: mostly ids (projectId, runId…), and for role changes
  // the roles before/after as lists. Read through the helpers that know the shape.
  metadata: Record<string, unknown> | null
  // Name and role are as they were WHEN the entry was written — the API stores
  // them on the row, so an entry still names the right person after they are
  // renamed or removed. `id` and `email` may point at a user who no longer exists.
  actor: { id: string | null; name: string; role: string | null; email: string | null } | null
  createdAt: string
}

export interface ActivityFilters {
  search?: string
  action?: string
  entityType?: string
  actorId?: string
  severity?: AuditSeverity
}
