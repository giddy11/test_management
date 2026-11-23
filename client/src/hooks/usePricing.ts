// hooks/usePricing.ts — the landing page's pricing section, and the platform
// owner's editor for it.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { PricingEndpoints } from "@/endpoints/pricing.endpoints"
import { ApiError } from "@/transport/http"
import type { PricingContent, PricingPlan, PricingView } from "@/types/pricing.types"

export const PUBLIC_PRICING_KEY = ["pricing", "public"]
export const PRICING_KEY = ["pricing", "admin"]

/** The plans switched on. Content saved before the switch existed has no value: shown. */
export function visiblePlans(content: PricingContent): PricingPlan[] {
  return content.plans.filter((p) => p.isVisible !== false)
}

/** What anonymous visitors see. Shared by the section and the header link. */
export function usePublicPricing() {
  return useQuery({
    queryKey: PUBLIC_PRICING_KEY,
    queryFn: async () => {
      const res = await PricingEndpoints.fetchPublic()
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode)
      return res.data
    },
    staleTime: 5 * 60_000,
    retry: 1,
  })
}

export function usePricingSettings() {
  return useQuery({
    queryKey: PRICING_KEY,
    queryFn: async () => {
      const res = await PricingEndpoints.fetch()
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode)
      return res.data
    },
  })
}

function useApply(successMessage: string, call: (content?: PricingContent) => ReturnType<typeof PricingEndpoints.fetch>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (content?: PricingContent) => {
      const res = await call(content)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
    onSuccess: (view: PricingView) => {
      qc.setQueryData(PRICING_KEY, view)
      qc.invalidateQueries({ queryKey: PUBLIC_PRICING_KEY })
      toast.success(successMessage)
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Something went wrong"),
  })
}

export function useSavePricing() {
  return useApply("Pricing saved. The landing page shows it now.", (content) =>
    PricingEndpoints.save(content as PricingContent)
  )
}

export function useResetPricing() {
  return useApply("Pricing reset to the built-in defaults", () => PricingEndpoints.reset())
}
