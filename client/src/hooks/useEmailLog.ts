// hooks/useEmailLog.ts — React Query bridge for the email log page.
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { EmailLogEndpoints } from "@/endpoints/emailLog.endpoints"
import { resolvePeriod, type PeriodSelection } from "@/lib/emailLogPeriods"
import { ApiError } from "@/transport/http"
import type { EmailLogFilters } from "@/types/emailLog.types"

// Both the table and the tiles refresh this often while the page is open
// (React Query pauses it while the tab is hidden).
export const EMAIL_LOG_POLL_MS = 30_000

interface ListParams {
  selection: PeriodSelection
  filters: EmailLogFilters
  page: number
  limit: number
}

// The period is turned into its exact window INSIDE the query function, not in
// the query key: "Last 24 hours" is a different window every time it runs, and
// recomputing on every fetch is what keeps it sliding.
export function useEmailLogs({ selection, filters, page, limit }: ListParams) {
  return useQuery({
    queryKey: ["email-log", "list", selection, filters, page, limit],
    queryFn: async () => {
      const res = await EmailLogEndpoints.list({ ...filters, ...resolvePeriod(selection, new Date()), page, limit })
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return { data: res.data ?? [], meta: res.meta }
    },
    // Paging and filtering keep the last result on screen until the next arrives.
    placeholderData: keepPreviousData,
    refetchInterval: EMAIL_LOG_POLL_MS,
  })
}

export function useEmailLogSummary(selection: PeriodSelection, filters: EmailLogFilters) {
  // The tiles ARE the status filter, so they never send it.
  const { status: _status, ...shared } = filters
  return useQuery({
    queryKey: ["email-log", "summary", selection, shared],
    queryFn: async () => {
      const res = await EmailLogEndpoints.summary({ ...shared, ...resolvePeriod(selection, new Date()) })
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode)
      return res.data
    },
    placeholderData: keepPreviousData,
    refetchInterval: EMAIL_LOG_POLL_MS,
  })
}
