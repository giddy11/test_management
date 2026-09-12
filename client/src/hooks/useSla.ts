// hooks/useSla.ts — React Query bridge for the SLA tracking dashboard.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { SlaEndpoints } from "@/endpoints/sla.endpoints"
import { ApiError } from "@/transport/http"
import type { SlaFilters, SlaTicketsParams, UpdateSlaSettingsPayload } from "@/types/sla.types"

const SLA_KEY = "sla"

export function useSlaOverview(filters: SlaFilters) {
  return useQuery({
    queryKey: [SLA_KEY, "overview", filters],
    queryFn: async () => {
      const res = await SlaEndpoints.overview(filters)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode)
      return res.data
    },
    // Open tickets are judged on a live clock — keep the figures fresh
    // without hammering the server.
    refetchInterval: 60_000,
  })
}

export function useSlaTickets(params: SlaTicketsParams, enabled = true) {
  return useQuery({
    queryKey: [SLA_KEY, "tickets", params],
    queryFn: async () => {
      const res = await SlaEndpoints.tickets(params)
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return { data: res.data ?? [], meta: res.meta }
    },
    enabled,
  })
}

export function useSlaFilterOptions() {
  return useQuery({
    queryKey: [SLA_KEY, "filters"],
    queryFn: async () => {
      const res = await SlaEndpoints.filterOptions()
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode)
      return res.data
    },
    staleTime: 5 * 60_000,
  })
}

export function useSlaSettings(enabled = true) {
  return useQuery({
    queryKey: [SLA_KEY, "settings"],
    queryFn: async () => {
      const res = await SlaEndpoints.settings()
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode)
      return res.data
    },
    enabled,
  })
}

export function useUpdateSlaSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: UpdateSlaSettingsPayload) => {
      const res = await SlaEndpoints.updateSettings(payload)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
    // Rule changes re-judge every ticket — refresh everything SLA-related.
    onSuccess: () => qc.invalidateQueries({ queryKey: [SLA_KEY] }),
  })
}
