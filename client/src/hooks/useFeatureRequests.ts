import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { FeatureRequestEndpoints } from "@/endpoints/featureRequest.endpoints"
import { ApiError } from "@/transport/http"
import type {
  CreateFeatureRequestPayload,
  FeatureRequestSearchField,
  UpdateFeatureRequestStatusPayload,
} from "@/types/featureRequest.types"
import type { FeatureRequestStatus } from "@/lib/enums"

export const FEATURE_REQUESTS_KEY = "featureRequests"

interface FeatureRequestQuery {
  page?: number
  limit?: number
  status?: FeatureRequestStatus
  category?: string
  search?: string
  searchBy?: FeatureRequestSearchField
  sort?: "top" | "newest"
}

export function useFeatureRequests(projectId: string, params: FeatureRequestQuery = {}) {
  return useQuery({
    queryKey: [FEATURE_REQUESTS_KEY, projectId, params],
    queryFn: async () => {
      const res = await FeatureRequestEndpoints.fetchAll({ projectId, limit: 20, sort: "top", ...params })
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return { data: res.data ?? [], meta: res.meta }
    },
    enabled: Boolean(projectId),
  })
}

export function useFeatureRequest(id: string) {
  return useQuery({
    queryKey: [FEATURE_REQUESTS_KEY, "detail", id],
    queryFn: async () => {
      const res = await FeatureRequestEndpoints.fetchById(id)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode)
      return res.data
    },
    enabled: Boolean(id),
  })
}

export function useFeatureRequestByCode(code: string) {
  return useQuery({
    queryKey: [FEATURE_REQUESTS_KEY, "detail-by-code", code],
    queryFn: async () => {
      const res = await FeatureRequestEndpoints.fetchByCode(code)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode)
      return res.data
    },
    enabled: Boolean(code),
  })
}

export function useCreateFeatureRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateFeatureRequestPayload) => {
      const res = await FeatureRequestEndpoints.create(payload)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [FEATURE_REQUESTS_KEY] }),
  })
}

export function useUpdateFeatureRequestStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: UpdateFeatureRequestStatusPayload }) => {
      const res = await FeatureRequestEndpoints.updateStatus(id, payload)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [FEATURE_REQUESTS_KEY] }),
  })
}

export function useDeleteFeatureRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await FeatureRequestEndpoints.remove(id)
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return res
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [FEATURE_REQUESTS_KEY] }),
  })
}
