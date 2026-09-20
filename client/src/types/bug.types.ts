// types/bug.types.ts
import type { BugSeverity, BugPriority, BugStatus } from "@/lib/enums"

export interface Bug {
  id: string
  referenceCode: string
  projectId: string
  title: string
  description: string
  stepsToReproduce: string[]
  expectedBehavior: string | null
  actualBehavior: string | null
  environment: string | null
  severity: BugSeverity
  priority: BugPriority
  status: BugStatus
  testCaseId: string | null
  testRunId: string | null
  reportedBy: { id: string; name: string } | null
  assignedTo: { id: string; name: string } | null
  resolvedAt: string | null
  closedAt: string | null
  statusUpdatedAt: string | null
  createdAt: string
}

export interface BugAttachment {
  id: string
  bugId: string
  fileName: string
  fileUrl: string
  mimeType: string
  fileSizeBytes: number
  createdAt: string
}

export interface CreateBugPayload {
  projectId: string
  title: string
  description: string
  stepsToReproduce?: string[]
  expectedBehavior?: string
  actualBehavior?: string
  environment?: string
  severity?: BugSeverity
  priority?: BugPriority
  testCaseId?: string
  testRunId?: string
}

// PATCH /bugs/:id takes triage fields (managers only) and/or corrections to the
// report itself (reporter or manager). Optional text is nullable so it can be cleared.
export interface ManageBugPayload {
  status?: BugStatus
  severity?: BugSeverity
  priority?: BugPriority
  assignedToId?: string | null
  title?: string
  description?: string
  stepsToReproduce?: string[]
  expectedBehavior?: string | null
  actualBehavior?: string | null
  environment?: string | null
  testCaseId?: string | null
}
