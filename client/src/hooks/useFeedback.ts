// hooks/useFeedback.ts — React Query bridge for external feedback.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { FeedbackEndpoints } from "@/endpoints/feedback.endpoints"
import { ApiError } from "@/transport/http"
import type {
  FeedbackSeverity,
  FetchFeedbackParams,
  ManageFeedbackPayload,
  SupportQueueParams,
} from "@/types/feedback.types"

const FEEDBACK_KEY = "feedback"
const PROJECTS_KEY = "projects"

// projectId omitted => the cross-project view (backend scopes by role).
export function useFeedback(params: FetchFeedbackParams) {
  return useQuery({
    queryKey: [FEEDBACK_KEY, params],
    queryFn: async () => {
      const res = await FeedbackEndpoints.fetchAll(params)
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return { data: res.data ?? [], meta: res.meta }
    },
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

export function useDeleteFeedback() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await FeedbackEndpoints.remove(id)
      if (!res.success) throw new ApiError(res.message, res.statusCode, res.errors)
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

// ── IT support portal (it_support role) ─────────────────────────────────────

export function useSupportQueue(params: SupportQueueParams) {
  return useQuery({
    queryKey: [FEEDBACK_KEY, "support", params],
    queryFn: async () => {
      const res = await FeedbackEndpoints.supportQueue(params)
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return { data: res.data ?? [], meta: res.meta }
    },
  })
}

// Leads only — the teammate list for the assign dropdown.
export function useSupportTeammates(enabled: boolean) {
  return useQuery({
    queryKey: [FEEDBACK_KEY, "support", "teammates"],
    queryFn: async () => {
      const res = await FeedbackEndpoints.supportTeammates()
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return res.data ?? []
    },
    enabled,
  })
}

export function useAssignSupportItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, supporterId }: { id: string; supporterId: string | null }) => {
      const res = await FeedbackEndpoints.supportAssign(id, supporterId)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [FEEDBACK_KEY] }),
  })
}

export function useUpdateSupportStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (
      { id, supportStatus, note }: { id: string; supportStatus: string; note?: string }
    ) => {
      const res = await FeedbackEndpoints.supportUpdateStatus(id, supportStatus, note)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [FEEDBACK_KEY] }),
  })
}

export function useSupportHistory(feedbackId: string, enabled: boolean) {
  return useQuery({
    queryKey: [FEEDBACK_KEY, "support", feedbackId, "history"],
    queryFn: async () => {
      const res = await FeedbackEndpoints.supportHistory(feedbackId)
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return res.data ?? []
    },
    enabled: enabled && Boolean(feedbackId),
  })
}

export function useResolveSupportItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => {
      const res = await FeedbackEndpoints.supportResolve(id, note)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [FEEDBACK_KEY] }),
  })
}

export function useEscalateSupportItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (
      { id, severity, note }: { id: string; severity: FeedbackSeverity; note?: string }
    ) => {
      const res = await FeedbackEndpoints.supportEscalate(id, severity, note)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [FEEDBACK_KEY] }),
  })
}

export function useNotifySubmitterFixed() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => {
      const res = await FeedbackEndpoints.supportNotifySubmitter(id, note)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [FEEDBACK_KEY] }),
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

