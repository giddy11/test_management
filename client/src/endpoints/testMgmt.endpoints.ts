// endpoints/testMgmt.endpoints.ts — suites, cases, runs, results, attachments, dashboard.
import { wrapCall, uploadCall, uploadWithFields, downloadFile } from "@/transport/http"
import type {
  Attachment,
  CreateCasePayload,
  CreateRunPayload,
  CreateSuitePayload,
  DashboardOverview,
  ImportPreview,
  RecordResultPayload,
  TestCase,
  TestRun,
  TestRunResult,
  TestSuite,
  UpdateCasePayload,
  UpdateSuitePayload,
} from "@/types/testMgmt.types"

const obj = (p: unknown) => p as Record<string, unknown>

export const SuiteEndpoints = {
  fetchAll: (params: { projectId: string; page?: number; limit?: number; search?: string }) =>
    wrapCall<TestSuite[]>("GET", "/api/v1/test-suites", obj(params)),
  fetchById: (id: string) => wrapCall<TestSuite>("GET", `/api/v1/test-suites/${id}`),
  create: (payload: CreateSuitePayload) => wrapCall<TestSuite>("POST", "/api/v1/test-suites", obj(payload)),
  update: (id: string, payload: UpdateSuitePayload) =>
    wrapCall<TestSuite>("PATCH", `/api/v1/test-suites/${id}`, obj(payload)),
  remove: (id: string) => wrapCall<null>("DELETE", `/api/v1/test-suites/${id}`),
}

export const CaseEndpoints = {
  fetchAll: (params: {
    suite: string
    page?: number
    limit?: number
    search?: string
    priority?: string
    status?: string
    runStatus?: string
  }) => wrapCall<TestCase[]>("GET", "/api/v1/test-cases", obj(params)),
  fetchById: (id: string) => wrapCall<TestCase>("GET", `/api/v1/test-cases/${id}`),
  create: (payload: CreateCasePayload) => wrapCall<TestCase>("POST", "/api/v1/test-cases", obj(payload)),
  update: (id: string, payload: UpdateCasePayload) =>
    wrapCall<TestCase>("PATCH", `/api/v1/test-cases/${id}`, obj(payload)),
  remove: (id: string) => wrapCall<null>("DELETE", `/api/v1/test-cases/${id}`),
  assign: (id: string, userIds: string[], deadline?: string | null) =>
    wrapCall<TestCase>("PATCH", `/api/v1/test-cases/${id}/assignees`, { userIds, deadline }),
}

export const AttachmentEndpoints = {
  fetchAll: (caseId: string) =>
    wrapCall<Attachment[]>("GET", `/api/v1/test-cases/${caseId}/attachments`),
  upload: (caseId: string, files: File[]) =>
    uploadCall<Attachment[]>(`/api/v1/test-cases/${caseId}/attachments`, files, "images"),
  remove: (caseId: string, attachmentId: string) =>
    wrapCall<null>("DELETE", `/api/v1/test-cases/${caseId}/attachments/${attachmentId}`),
}

export const ResultAttachmentEndpoints = {
  fetchAll: (resultId: string) =>
    wrapCall<Attachment[]>("GET", `/api/v1/test-run-results/${resultId}/attachments`),
  upload: (resultId: string, files: File[]) =>
    uploadCall<Attachment[]>(`/api/v1/test-run-results/${resultId}/attachments`, files, "images"),
  remove: (resultId: string, attachmentId: string) =>
    wrapCall<null>("DELETE", `/api/v1/test-run-results/${resultId}/attachments/${attachmentId}`),
}

export const RunEndpoints = {
  fetchAll: (params: { projectId: string; page?: number; limit?: number }) =>
    wrapCall<TestRun[]>("GET", "/api/v1/test-runs", obj(params)),
  fetchById: (id: string) => wrapCall<TestRun>("GET", `/api/v1/test-runs/${id}`),
  create: (payload: CreateRunPayload) => wrapCall<TestRun>("POST", "/api/v1/test-runs", obj(payload)),
  update: (id: string, payload: { name?: string; status?: string }) =>
    wrapCall<TestRun>("PATCH", `/api/v1/test-runs/${id}`, obj(payload)),
  remove: (id: string) => wrapCall<null>("DELETE", `/api/v1/test-runs/${id}`),
}

export const ResultEndpoints = {
  fetchAll: (params: { runId: string; page?: number; limit?: number; status?: string }) =>
    wrapCall<TestRunResult[]>("GET", "/api/v1/test-run-results", obj(params)),
  record: (id: string, payload: RecordResultPayload) =>
    wrapCall<TestRunResult>("PATCH", `/api/v1/test-run-results/${id}`, obj(payload)),
  bulkRecord: (payload: { runId: string; ids: string[]; status: string | null }) =>
    wrapCall<null>("PATCH", "/api/v1/test-run-results/bulk", obj(payload)),
}

export const ImportEndpoints = {
  downloadTemplate: () =>
    downloadFile("/api/v1/test-cases/template", "testmate-template.xlsx"),
  upload: (suiteId: string, file: File) =>
    uploadWithFields<ImportPreview>("/api/v1/test-cases/import", file, { suiteId }),
  preview: (importId: string) =>
    wrapCall<ImportPreview>("GET", `/api/v1/test-cases/import/${importId}`),
  confirm: (importId: string) =>
    wrapCall<{ created: number; duplicatesSkipped: number }>("POST", `/api/v1/test-cases/import/${importId}/confirm`),
}

export const DashboardEndpoints = {
  overview: (projectId?: string) =>
    wrapCall<DashboardOverview>("GET", "/api/v1/dashboard/overview", projectId ? { projectId } : {}),
}
