// hooks/useReviewPrompts.ts — the "please confirm this" reminder: answering it,
// and the platform owner's settings for it.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ReviewPromptEndpoints } from "@/endpoints/reviewPrompt.endpoints"
import { BUGS_KEY } from "@/hooks/useBugs"
import { FEATURE_REQUESTS_KEY } from "@/hooks/useFeatureRequests"
import { ApiError } from "@/transport/http"
import type { ReviewAnswer, ReviewItem, ReviewItemType, WorkItem } from "@/types/reviewPrompt.types"

const SETTINGS_KEY = ["review-prompt", "settings"]

// Refetches the lists a change from the pop-up affects. Run when settled, not
// only on success: a refusal usually means the item already moved on, so what's
// on screen behind the pop-up is stale too.
function useRefreshTickets() {
  const qc = useQueryClient()
  return (type: ReviewItemType) =>
    qc.invalidateQueries({ queryKey: [type === "bug" ? BUGS_KEY : FEATURE_REQUESTS_KEY] })
}

export function useAnswerReview() {
  const refresh = useRefreshTickets()
  return useMutation({
    mutationFn: async ({ item, answer }: { item: ReviewItem; answer: ReviewAnswer }) => {
      const res = await ReviewPromptEndpoints.answer(item.type, item.id, answer)
      if (!res.success) throw new ApiError(res.message, res.statusCode, res.errors)
    },
    onSettled: (_data, _error, { item }) => refresh(item.type),
  })
}

export function useSubmitForReview() {
  const refresh = useRefreshTickets()
  return useMutation({
    mutationFn: async (item: WorkItem) => {
      const res = await ReviewPromptEndpoints.submitForReview(item.type, item.id)
      if (!res.success) throw new ApiError(res.message, res.statusCode, res.errors)
    },
    onSettled: (_data, _error, item) => refresh(item.type),
  })
}

export function useReviewPromptSettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: async () => {
      const res = await ReviewPromptEndpoints.fetchSettings()
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode)
      return res.data
    },
  })
}

export function useSaveReviewPromptSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (settings: { enabled: boolean; intervalHours: number }) => {
      const res = await ReviewPromptEndpoints.saveSettings(settings)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
    onSuccess: (settings) => qc.setQueryData(SETTINGS_KEY, settings),
  })
}
