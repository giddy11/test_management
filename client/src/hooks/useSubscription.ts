// hooks/useSubscription.ts — the organisation's plan (for showing what's
// included and locking what isn't), and the platform owner's plan tools.
//
// Locking something in the UI is a courtesy: the server checks the plan on
// every request regardless.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { SubscriptionEndpoints } from "@/endpoints/subscription.endpoints"
import { ApiError } from "@/transport/http"
import { useAuth } from "@/contexts/AuthContext"
import type { ApiResponse } from "@/types/api.types"
import type {
  FeatureKey,
  OrganizationPlanDetail,
  PlanCatalog,
  PlanEntitlements,
  PlanKey,
  RecordPaymentPayload,
  SetPlanPayload,
} from "@/types/subscription.types"

export const MY_PLAN_KEY = ["subscription", "me"]
export const PLAN_CATALOG_KEY = ["subscription", "catalog"]
export const orgPlanKey = (organizationId: string) => ["subscription", "organization", organizationId]

async function unwrap<T>(call: Promise<ApiResponse<T>>): Promise<T> {
  const res = await call
  if (!res.success) throw new ApiError(res.message, res.statusCode, res.errors ?? [])
  return res.data as T
}

export function useMyPlan() {
  const { user } = useAuth()
  return useQuery({
    queryKey: MY_PLAN_KEY,
    queryFn: () => unwrap(SubscriptionEndpoints.fetchMine()),
    enabled: !!user,
    staleTime: 60_000,
  })
}

/**
 * Whether the organisation's plan includes a feature. Undefined while loading,
 * so callers can avoid flashing a lock at people who do have it.
 */
export function usePlanFeature(feature: FeatureKey): boolean | undefined {
  const { data } = useMyPlan()
  if (data === undefined) return undefined
  return data?.features[feature] ?? false
}

export function usePlanCatalog(enabled = true) {
  return useQuery({
    queryKey: PLAN_CATALOG_KEY,
    queryFn: () => unwrap<PlanCatalog>(SubscriptionEndpoints.fetchCatalog()),
    enabled,
  })
}

export function useSaveEntitlements() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Record<PlanKey, PlanEntitlements>) => unwrap<PlanCatalog>(SubscriptionEndpoints.saveEntitlements(body)),
    onSuccess: (catalog) => {
      qc.setQueryData(PLAN_CATALOG_KEY, catalog)
      qc.invalidateQueries({ queryKey: ["subscription"] })
      qc.invalidateQueries({ queryKey: ["organizations"] })
      toast.success("Plan features saved")
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't save the plan features"),
  })
}

export function useOrganizationPlan(organizationId: string | null) {
  return useQuery({
    queryKey: orgPlanKey(organizationId ?? ""),
    queryFn: () => unwrap<OrganizationPlanDetail>(SubscriptionEndpoints.fetchOrganization(organizationId as string)),
    enabled: !!organizationId,
  })
}

function usePlanWrite<T>(organizationId: string, call: (body: T) => Promise<OrganizationPlanDetail>, message: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: call,
    onSuccess: (detail) => {
      qc.setQueryData(orgPlanKey(organizationId), detail)
      qc.invalidateQueries({ queryKey: ["organizations"] })
      qc.invalidateQueries({ queryKey: MY_PLAN_KEY })
      toast.success(message)
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Something went wrong"),
  })
}

export function useSetOrganizationPlan(organizationId: string) {
  return usePlanWrite<SetPlanPayload>(
    organizationId,
    (body) => unwrap(SubscriptionEndpoints.setPlan(organizationId, body)),
    "Plan updated",
  )
}

export function useRecordPayment(organizationId: string) {
  return usePlanWrite<RecordPaymentPayload>(
    organizationId,
    (body) => unwrap(SubscriptionEndpoints.recordPayment(organizationId, body)),
    "Payment recorded and plan updated",
  )
}
