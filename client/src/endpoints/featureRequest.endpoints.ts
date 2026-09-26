// endpoints/featureRequest.endpoints.ts
import { wrapCall, uploadCall } from "@/transport/http"
import type {
  CreateFeatureRequestPayload,
  FeatureRequest,
  FeatureRequestAttachment,
  FeatureRequestComment,
  FeatureRequestSearchField,
  FeatureRequestStatusHistoryEntry,
  UpdateFeatureRequestStatusPayload,
  VoteResult,
} from "@/types/featureRequest.types"

const obj = (p: unknown) => p as Record<string, unknown>

export const FeatureRequestEndpoints = {
  fetchAll: (params: { projectId: string; page?: number; limit?: number; status?: string; category?: string; search?: string; searchBy?: FeatureRequestSearchField; from?: string; to?: string; sort?: "top" | "newest" }) =>
    wrapCall<FeatureRequest[]>("GET", "/api/v1/feature-requests", obj(params)),
  fetchById: (id: string) => wrapCall<FeatureRequest>("GET", `/api/v1/feature-requests/${id}`),
  fetchByCode: (code: string) =>
    wrapCall<FeatureRequest>("GET", `/api/v1/feature-requests/by-code/${code}`),
  create: (payload: CreateFeatureRequestPayload) =>
    wrapCall<FeatureRequest>("POST", "/api/v1/feature-requests", obj(payload)),
  updateStatus: (id: string, payload: UpdateFeatureRequestStatusPayload) =>
    wrapCall<FeatureRequest>("PATCH", `/api/v1/feature-requests/${id}`, obj(payload)),
  history: (id: string) =>
    wrapCall<FeatureRequestStatusHistoryEntry[]>("GET", `/api/v1/feature-requests/${id}/history`),
  remove: (id: string) => wrapCall<null>("DELETE", `/api/v1/feature-requests/${id}`),
  vote: (id: string) => wrapCall<VoteResult>("POST", `/api/v1/feature-requests/${id}/vote`),
}

export const FeatureRequestAttachmentEndpoints = {
  fetchAll: (requestId: string) =>
    wrapCall<FeatureRequestAttachment[]>("GET", `/api/v1/feature-requests/${requestId}/attachments`),
  upload: (requestId: string, files: File[]) =>
    uploadCall<FeatureRequestAttachment[]>(`/api/v1/feature-requests/${requestId}/attachments`, files, "images"),
  remove: (requestId: string, attachmentId: string) =>
    wrapCall<null>("DELETE", `/api/v1/feature-requests/${requestId}/attachments/${attachmentId}`),
}

export const FeatureRequestCommentEndpoints = {
  fetchAll: (requestId: string, params: { page?: number; limit?: number } = {}) =>
    wrapCall<FeatureRequestComment[]>("GET", `/api/v1/feature-requests/${requestId}/comments`, obj(params)),
  create: (requestId: string, body: string) =>
    wrapCall<FeatureRequestComment>("POST", `/api/v1/feature-requests/${requestId}/comments`, { body }),
  remove: (requestId: string, commentId: string) =>
    wrapCall<null>("DELETE", `/api/v1/feature-requests/${requestId}/comments/${commentId}`),
}
