import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { wrapCall, downloadFile } from "@/transport/http"
import { ApiError } from "@/transport/http"
import type { ActivityFilters, ActivityLog } from "@/types/activity.types"

interface ActivityParams extends ActivityFilters {
  page?: number
  limit?: number
}

export function useActivity(params: ActivityParams) {
  return useQuery({
    queryKey: ["activity", params],
    queryFn: async () => {
      const res = await wrapCall<ActivityLog[]>(
        "GET",
        "/api/v1/activity",
        params as Record<string, unknown>
      )
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return { data: res.data ?? [], meta: res.meta }
    },
    // Paging and typing in the search box shouldn't blank the table out and
    // collapse the page height under the cursor.
    placeholderData: keepPreviousData,
  })
}

// Exports the CURRENT filtered view — same filters, no page/limit, so the file
// is everything the reader is looking at rather than the page they happen to be on.
export async function exportActivity(filters: ActivityFilters): Promise<void> {
  const query = new URLSearchParams(
    Object.entries(filters).filter(([, v]) => v !== undefined && v !== "") as [string, string][]
  ).toString()
  const stamp = new Date().toISOString().slice(0, 10)
  await downloadFile(
    `/api/v1/activity/export${query ? `?${query}` : ""}`,
    `activity-log-${stamp}.csv`
  )
}
