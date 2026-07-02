import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query"
import { FeatureRequestEndpoints } from "@/endpoints/featureRequest.endpoints"
import { ApiError } from "@/transport/http"
import { FEATURE_REQUESTS_KEY } from "@/hooks/useFeatureRequests"
import type { FeatureRequest } from "@/types/featureRequest.types"

interface FeatureRequestListData {
  data: FeatureRequest[]
  meta?: unknown
}

function isListData(value: unknown): value is FeatureRequestListData {
  return typeof value === "object" && value !== null && Array.isArray((value as FeatureRequestListData).data)
}

function isFeatureRequest(value: unknown): value is FeatureRequest {
  return typeof value === "object" && value !== null && "hasVoted" in value && "upvoteCount" in value
}

function flip(fr: FeatureRequest, id: string): FeatureRequest {
  if (fr.id !== id) return fr
  const voted = !fr.hasVoted
  return { ...fr, hasVoted: voted, upvoteCount: fr.upvoteCount + (voted ? 1 : -1) }
}

// Optimistically flips hasVoted/upvoteCount everywhere the request appears in the
// cache (list pages + detail), rolling back if the request fails.
export function useToggleFeatureRequestVote() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await FeatureRequestEndpoints.vote(id)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: [FEATURE_REQUESTS_KEY] })
      const snapshots: [QueryKey, unknown][] = qc.getQueriesData({ queryKey: [FEATURE_REQUESTS_KEY] })

      snapshots.forEach(([queryKey, data]) => {
        if (isListData(data)) {
          qc.setQueryData(queryKey, { ...data, data: data.data.map((fr) => flip(fr, id)) })
        } else if (isFeatureRequest(data)) {
          qc.setQueryData(queryKey, flip(data, id))
        }
      })

      return { snapshots }
    },
    onError: (_err, _id, context) => {
      context?.snapshots.forEach(([queryKey, data]) => qc.setQueryData(queryKey, data))
    },
    onSettled: () => qc.invalidateQueries({ queryKey: [FEATURE_REQUESTS_KEY] }),
  })
}
