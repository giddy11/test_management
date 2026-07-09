// endpoints/siteBanner.endpoints.ts
import { wrapCall } from "@/transport/http"
import type { SiteBanner } from "@/types/siteBanner.types"

export const SiteBannerEndpoints = {
  fetchCurrent: () => wrapCall<SiteBanner>("GET", "/api/v1/site-banner/current"),
  activate: (payload: { message: string; durationMinutes: number }) =>
    wrapCall<SiteBanner>("POST", "/api/v1/site-banner/activate", payload as Record<string, unknown>),
  deactivate: () => wrapCall<SiteBanner>("POST", "/api/v1/site-banner/deactivate"),
}
