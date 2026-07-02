import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { FeatureRequestAttachmentEndpoints } from "@/endpoints/featureRequest.endpoints"
import { ApiError } from "@/transport/http"

const KEY = "featureRequestAttachments"

export function useFeatureRequestAttachments(requestId: string) {
  return useQuery({
    queryKey: [KEY, requestId],
    queryFn: async () => {
      const res = await FeatureRequestAttachmentEndpoints.fetchAll(requestId)
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return res.data ?? []
    },
    enabled: Boolean(requestId),
  })
}

export function useUploadFeatureRequestAttachments(requestId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (files: File[]) => {
      const res = await FeatureRequestAttachmentEndpoints.upload(requestId, files)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY, requestId] }),
  })
}

export function useDeleteFeatureRequestAttachment(requestId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (attachmentId: string) => {
      const res = await FeatureRequestAttachmentEndpoints.remove(requestId, attachmentId)
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return res
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY, requestId] }),
  })
}
