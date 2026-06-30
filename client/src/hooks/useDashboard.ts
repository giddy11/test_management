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
