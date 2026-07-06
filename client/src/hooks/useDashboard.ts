import { useQuery } from "@tanstack/react-query"
import { DashboardEndpoints } from "@/endpoints/testMgmt.endpoints"
import { ApiError } from "@/transport/http"

export function useDashboard(projectId?: string) {
  return useQuery({
    queryKey: ["dashboard", projectId ?? "all"],
    queryFn: async () => {
      const res = await DashboardEndpoints.overview(projectId)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode)
      return res.data
    },
  })
}

interface RecentRunsParams {
  projectId?: string
  suiteId?: string
  status?: string
  page?: number
  limit?: number
}

export function useRecentRuns(params: RecentRunsParams) {
  return useQuery({
    queryKey: ["dashboard", "recent-runs", params],
    queryFn: async () => {
      const res = await DashboardEndpoints.recentRuns(params)
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return { data: res.data ?? [], meta: res.meta }
    },
  })
}
