// endpoints/bug.endpoints.ts
import { wrapCall, uploadCall } from "@/transport/http"
import type {
  Bug,
  BugAttachment,
  BugSearchField,
  BugStatusHistoryEntry,
  CreateBugPayload,
  ManageBugPayload,
} from "@/types/bug.types"

const obj = (p: unknown) => p as Record<string, unknown>

export const BugEndpoints = {
  fetchAll: (params: {
    projectId: string
    page?: number
    limit?: number
    status?: string
    severity?: string
    priority?: string
    assignedToId?: string
    search?: string
    searchBy?: BugSearchField
    // YYYY-MM-DD, inclusive — filters on the date the bug was reported.
    from?: string
    to?: string
  }) => wrapCall<Bug[]>("GET", "/api/v1/bugs", obj(params)),
  fetchById: (id: string) => wrapCall<Bug>("GET", `/api/v1/bugs/${id}`),
  fetchByCode: (code: string) => wrapCall<Bug>("GET", `/api/v1/bugs/by-code/${code}`),
  create: (payload: CreateBugPayload) => wrapCall<Bug>("POST", "/api/v1/bugs", obj(payload)),
  manage: (id: string, payload: ManageBugPayload) =>
    wrapCall<Bug>("PATCH", `/api/v1/bugs/${id}`, obj(payload)),
  history: (id: string) => wrapCall<BugStatusHistoryEntry[]>("GET", `/api/v1/bugs/${id}/history`),
  remove: (id: string) => wrapCall<null>("DELETE", `/api/v1/bugs/${id}`),
}

export const BugAttachmentEndpoints = {
  fetchAll: (bugId: string) => wrapCall<BugAttachment[]>("GET", `/api/v1/bugs/${bugId}/attachments`),
  upload: (bugId: string, files: File[]) =>
    uploadCall<BugAttachment[]>(`/api/v1/bugs/${bugId}/attachments`, files, "images"),
  remove: (bugId: string, attachmentId: string) =>
    wrapCall<null>("DELETE", `/api/v1/bugs/${bugId}/attachments/${attachmentId}`),
}
