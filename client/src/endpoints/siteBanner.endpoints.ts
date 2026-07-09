// endpoints/siteBanner.endpoints.ts
import { wrapCall } from "@/transport/http"
import type { SiteBanner } from "@/types/siteBanner.types"
import type { BroadcastAudience } from "@/components/announcements/AudiencePicker"

export interface ActivateSiteBannerPayload {
  message: string
  durationMinutes: number
  audience: BroadcastAudience
  recipientIds?: string[]
}

export const SiteBannerEndpoints = {
  fetchCurrent: () => wrapCall<SiteBanner>("GET", "/api/v1/site-banner/current"),
  activate: (payload: ActivateSiteBannerPayload) =>
    wrapCall<SiteBanner>("POST", "/api/v1/site-banner/activate", payload as unknown as Record<string, unknown>),
  deactivate: () => wrapCall<SiteBanner>("POST", "/api/v1/site-banner/deactivate"),
}
