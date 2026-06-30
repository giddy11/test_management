import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AttachmentEndpoints } from "@/endpoints/testMgmt.endpoints"
import { ApiError } from "@/transport/http"

const KEY = "attachments"

export function useAttachments(caseId: string) {
  return useQuery({
    queryKey: [KEY, caseId],
    queryFn: async () => {
      const res = await AttachmentEndpoints.fetchAll(caseId)
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return res.data ?? []
    },
    enabled: Boolean(caseId),
  })
}

export function useUploadAttachments(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (files: File[]) => {
      const res = await AttachmentEndpoints.upload(caseId, files)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY, caseId] }),
  })
}

export function useDeleteAttachment(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (attachmentId: string) => {
      const res = await AttachmentEndpoints.remove(caseId, attachmentId)
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return res
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY, caseId] }),
  })
}
