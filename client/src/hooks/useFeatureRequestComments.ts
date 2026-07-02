import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { FeatureRequestCommentEndpoints } from "@/endpoints/featureRequest.endpoints"
import { ApiError } from "@/transport/http"
import { FEATURE_REQUESTS_KEY } from "@/hooks/useFeatureRequests"

const KEY = "featureRequestComments"

export function useFeatureRequestComments(requestId: string) {
  return useQuery({
    queryKey: [KEY, requestId],
    queryFn: async () => {
      const res = await FeatureRequestCommentEndpoints.fetchAll(requestId, { limit: 50 })
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return res.data ?? []
    },
    enabled: Boolean(requestId),
  })
}

export function useAddFeatureRequestComment(requestId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: string) => {
      const res = await FeatureRequestCommentEndpoints.create(requestId, body)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY, requestId] })
      qc.invalidateQueries({ queryKey: [FEATURE_REQUESTS_KEY] })
    },
  })
}

export function useDeleteFeatureRequestComment(requestId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (commentId: string) => {
      const res = await FeatureRequestCommentEndpoints.remove(requestId, commentId)
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return res
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY, requestId] })
      qc.invalidateQueries({ queryKey: [FEATURE_REQUESTS_KEY] })
    },
  })
}
