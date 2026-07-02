// endpoints/featureRequest.endpoints.ts
import { wrapCall } from "@/transport/http"
import type {
  CreateFeatureRequestPayload,
  FeatureRequest,
  FeatureRequestComment,
  UpdateFeatureRequestStatusPayload,
  VoteResult,
} from "@/types/featureRequest.types"

const obj = (p: unknown) => p as Record<string, unknown>

export const FeatureRequestEndpoints = {
  fetchAll: (params: { projectId: string; page?: number; limit?: number; status?: string; category?: string; search?: string; sort?: "top" | "newest" }) =>
    wrapCall<FeatureRequest[]>("GET", "/api/v1/feature-requests", obj(params)),
  fetchById: (id: string) => wrapCall<FeatureRequest>("GET", `/api/v1/feature-requests/${id}`),
  create: (payload: CreateFeatureRequestPayload) =>
    wrapCall<FeatureRequest>("POST", "/api/v1/feature-requests", obj(payload)),
  updateStatus: (id: string, payload: UpdateFeatureRequestStatusPayload) =>
    wrapCall<FeatureRequest>("PATCH", `/api/v1/feature-requests/${id}`, obj(payload)),
  remove: (id: string) => wrapCall<null>("DELETE", `/api/v1/feature-requests/${id}`),
  vote: (id: string) => wrapCall<VoteResult>("POST", `/api/v1/feature-requests/${id}/vote`),
}

export const FeatureRequestCommentEndpoints = {
  fetchAll: (requestId: string, params: { page?: number; limit?: number } = {}) =>
    wrapCall<FeatureRequestComment[]>("GET", `/api/v1/feature-requests/${requestId}/comments`, obj(params)),
  create: (requestId: string, body: string) =>
    wrapCall<FeatureRequestComment>("POST", `/api/v1/feature-requests/${requestId}/comments`, { body }),
  remove: (requestId: string, commentId: string) =>
    wrapCall<null>("DELETE", `/api/v1/feature-requests/${requestId}/comments/${commentId}`),
}
