// endpoints/sla.endpoints.ts — SLA tracking dashboard & analytics.
import { wrapCall } from "@/transport/http"
import type {
  SlaFilterOptions,
  SlaFilters,
  SlaOverview,
  SlaSettings,
  SlaTicket,
  SlaTicketsParams,
  UpdateSlaSettingsPayload,
} from "@/types/sla.types"

// Axios drops undefined params, so unset filters simply aren't sent.
export const SlaEndpoints = {
  overview: (filters: SlaFilters) =>
    wrapCall<SlaOverview>("GET", "/api/v1/sla/overview", filters as unknown as Record<string, unknown>),

  // Drill-down: the tickets behind a dashboard figure.
  tickets: (params: SlaTicketsParams) =>
    wrapCall<SlaTicket[]>("GET", "/api/v1/sla/tickets", params as unknown as Record<string, unknown>),

  filterOptions: () => wrapCall<SlaFilterOptions>("GET", "/api/v1/sla/filters"),

  settings: () => wrapCall<SlaSettings>("GET", "/api/v1/sla/settings"),

  // Admin-only (server-enforced).
  updateSettings: (payload: UpdateSlaSettingsPayload) =>
    wrapCall<SlaSettings>("PUT", "/api/v1/sla/settings", payload as unknown as Record<string, unknown>),
}
