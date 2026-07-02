import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { BugAttachmentEndpoints } from "@/endpoints/bug.endpoints"
import { ApiError } from "@/transport/http"

const KEY = "bugAttachments"

export function useBugAttachments(bugId: string) {
  return useQuery({
    queryKey: [KEY, bugId],
    queryFn: async () => {
      const res = await BugAttachmentEndpoints.fetchAll(bugId)
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return res.data ?? []
    },
    enabled: Boolean(bugId),
  })
}

export function useUploadBugAttachments(bugId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (files: File[]) => {
      const res = await BugAttachmentEndpoints.upload(bugId, files)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY, bugId] }),
  })
}

export function useDeleteBugAttachment(bugId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (attachmentId: string) => {
      const res = await BugAttachmentEndpoints.remove(bugId, attachmentId)
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return res
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY, bugId] }),
  })
}
