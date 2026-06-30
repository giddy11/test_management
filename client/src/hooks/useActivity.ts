import { useQuery } from "@tanstack/react-query"
import { wrapCall } from "@/transport/http"
import { ApiError } from "@/transport/http"
import type { ActivityLog } from "@/types/activity.types"

export function useActivity(params: { page?: number; limit?: number }) {
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
  })
}
