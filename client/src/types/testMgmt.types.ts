// types/testMgmt.types.ts — suites, cases, runs, results, attachments + dashboard.
import type { TcPriority, TcStatus, RunStatus, ResultStatus } from "@/lib/enums"

// ── Test Suites ────────────────────────────────────────────────────────────────
export interface TestSuite {
  id: string
  name: string
  description: string | null
  projectId: string
  caseCount: number
  createdAt: string
}
export interface CreateSuitePayload {
  name: string
  description?: string
  projectId: string
}
export interface UpdateSuitePayload {
  name?: string
  description?: string | null
}

// ── Test Cases ─────────────────────────────────────────────────────────────────
export interface TestCase {
  id: string
  title: string
  description: string | null
  steps: string[]
  expectedResult: string
  priority: TcPriority
  status: TcStatus
  suiteId: string
  assignees: { id: string; name: string; email: string }[]
  tags: string[]
  deadline: string | null
  attachmentCount: number
  latestResultStatus: ResultStatus | "pending" | null
  createdAt: string
}
export interface CreateCasePayload {
  title: string
  description?: string
  steps: string[]
  expectedResult: string
  priority: TcPriority
  status?: TcStatus
  suite: string
  tags?: string[]
}
export interface UpdateCasePayload {
  title?: string
  description?: string | null
  steps?: string[]
  expectedResult?: string
  priority?: TcPriority
  status?: TcStatus
  tags?: string[]
}

// ── Test Runs ──────────────────────────────────────────────────────────────────
export interface RunSummary {
  total: number
  pass?: number
  fail?: number
  blocked?: number
  skipped?: number
  pending?: number
}
export interface TestRun {
  id: string
  name: string
  projectId: string
  suiteId: string
  status: RunStatus
  createdById: string
  createdByName: string | null
  testers: string[]
  createdAt: string
  summary?: RunSummary
}
export interface CreateRunPayload {
  name: string
  projectId: string
  suiteId: string
}

// ── Test Run Results ─────────────────────────────────────────────────────────────
export interface TestRunResult {
  id: string
  runId: string
  testCaseId: string
  caseTitle: string | null
  caseDescription: string | null
  casePriority: string | null
  caseSteps: string[] | null
  caseExpectedResult: string | null
  status: ResultStatus | null
  actualResult: string | null
  notes: string | null
  executedById: string | null
  executedAt: string | null
}
export interface RecordResultPayload {
  status?: ResultStatus | null // null clears the result
  actualResult?: string | null
  notes?: string | null
}

// ── Attachments ────────────────────────────────────────────────────────────────
export interface Attachment {
  id: string
  testCaseId: string
  fileName: string
  fileUrl: string
  mimeType: string
  fileSizeBytes: number
  createdAt: string
}

// ── Import ─────────────────────────────────────────────────────────────────────
export interface ImportRow {
  title: string
  description?: string
  steps: string[]
  expectedResult: string
  priority: TcPriority
  status: TcStatus
  tags?: string[]
}
export interface ImportRowError {
  row: number
  title?: string
  issues: { field: string; message: string }[]
}
export interface ImportDuplicate {
  title: string
  id: string  // always a valid UUID — rows without IDs are rejected, not listed here
  reason: "duplicate in file" | "already exists in suite"
}
export interface ImportPreview {
  importId: string
  suiteId?: string
  totalRows: number
  skippedCount?: number
  duplicatesCount?: number
  rows: ImportRow[]
  skipped?: ImportRowError[]
  duplicates?: ImportDuplicate[]
}

// ── Dashboard ──────────────────────────────────────────────────────────────────
export interface Distribution {
  key: string
  count: number
}
export interface ProjectBreakdown {
  id: string
  name: string
  suiteCount: number
  caseCount: number
}
export interface SuiteBreakdown {
  id: string
  name: string
  projectId: string
  caseCount: number
  pass: number
  fail: number
  blocked: number
  skipped: number
  pending: number
}
export interface TopPerformer {
  id: string
  name: string
  total: number
  passes: number
  failures: number
  passRate: number
}
export interface DashboardOverview {
  totals: { projects: number; suites: number; cases: number; runs: number }
  caseStatus: Distribution[]
  casePriority: Distribution[]
  resultBreakdown: {
    pass: number
    fail: number
    blocked: number
    skipped: number
    pending: number
    total: number
  }
  passRate: number
  recentRuns: {
    id: string
    name: string
    status: RunStatus
    projectId: string
    createdAt: string
    createdByName: string | null
    testers: string[]
    summary: RunSummary
  }[]
  projectsBreakdown: ProjectBreakdown[]
  suitesBreakdown: SuiteBreakdown[]
  topPerformers: TopPerformer[]
}
