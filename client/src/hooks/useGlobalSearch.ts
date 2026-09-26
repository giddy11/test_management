// hooks/useGlobalSearch.ts — React Query bridge for global search.
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { SearchEndpoints } from "@/endpoints/search.endpoints"
import { ApiError } from "@/transport/http"

const SEARCH_KEY = "global-search"

// The server ignores anything shorter, so don't spend a request on it either.
export const MIN_SEARCH_LENGTH = 2

// `term` is expected to be debounced by the caller — the query key changes on
// every distinct term, so an undebounced one would fire a request per keystroke.
export function useGlobalSearch(term: string, enabled = true) {
  const trimmed = term.trim()
  return useQuery({
    queryKey: [SEARCH_KEY, trimmed],
    queryFn: async () => {
      const res = await SearchEndpoints.search(trimmed)
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return res.data ?? []
    },
    enabled: enabled && trimmed.length >= MIN_SEARCH_LENGTH,
    // Keep the previous term's results on screen while the next ones load, so
    // the panel refines rather than blanking out between keystrokes.
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })
}
