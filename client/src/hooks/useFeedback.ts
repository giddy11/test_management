// hooks/useFeedback.ts — React Query bridge for external feedback.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { FeedbackEndpoints } from "@/endpoints/feedback.endpoints"
import { ApiError } from "@/transport/http"
import type { FetchFeedbackParams, ManageFeedbackPayload } from "@/types/feedback.types"

const FEEDBACK_KEY = "feedback"
const PROJECTS_KEY = "projects"

export function useFeedback(params: FetchFeedbackParams) {
  return useQuery({
    queryKey: [FEEDBACK_KEY, params],
    queryFn: async () => {
      const res = await FeedbackEndpoints.fetchAll(params)
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return { data: res.data ?? [], meta: res.meta }
    },
    enabled: Boolean(params.projectId),
  })
}

export function useManageFeedback() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: ManageFeedbackPayload }) => {
      const res = await FeedbackEndpoints.manage(id, payload)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [FEEDBACK_KEY] }),
  })
}

export function useFeedbackHistory(feedbackId: string, enabled: boolean) {
  return useQuery({
    queryKey: [FEEDBACK_KEY, feedbackId, "history"],
    queryFn: async () => {
      const res = await FeedbackEndpoints.history(feedbackId)
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return res.data ?? []
    },
    enabled: enabled && Boolean(feedbackId),
  })
}

export function useSetFeedbackLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ projectId, enabled }: { projectId: string; enabled: boolean }) => {
      const res = await FeedbackEndpoints.setLink(projectId, enabled)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
    // The token lives on the project detail — refresh it.
    onSuccess: () => qc.invalidateQueries({ queryKey: [PROJECTS_KEY] }),
  })
}
