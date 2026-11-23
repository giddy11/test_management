// endpoints/pricing.endpoints.ts
import { wrapCall } from "@/transport/http"
import type { PricingContent, PricingView } from "@/types/pricing.types"

export const PricingEndpoints = {
  /** Public, no login — what the landing page shows. */
  fetchPublic: () => wrapCall<PricingContent>("GET", "/api/v1/public/pricing"),
  /** Platform owner only (pricing.manage). */
  fetch: () => wrapCall<PricingView>("GET", "/api/v1/pricing"),
  save: (content: PricingContent) =>
    wrapCall<PricingView>("PUT", "/api/v1/pricing", content as unknown as Record<string, unknown>),
  reset: () => wrapCall<PricingView>("DELETE", "/api/v1/pricing"),
}
