// endpoints/subscription.endpoints.ts
import { wrapCall } from "@/transport/http"
import type {
  MyPlan,
  OrganizationPlanDetail,
  PlanCatalog,
  PlanEntitlements,
  PlanKey,
  RecordPaymentPayload,
  SetPlanPayload,
} from "@/types/subscription.types"

type Body = Record<string, unknown>

export const SubscriptionEndpoints = {
  /** The signed-in person's own organisation. null when they have none. */
  fetchMine: () => wrapCall<MyPlan | null>("GET", "/api/v1/subscription/me"),

  // Platform owner (subscription.manage).
  fetchCatalog: () => wrapCall<PlanCatalog>("GET", "/api/v1/subscription/catalog"),
  saveEntitlements: (body: Record<PlanKey, PlanEntitlements>) =>
    wrapCall<PlanCatalog>("PUT", "/api/v1/subscription/entitlements", body as unknown as Body),
  fetchOrganization: (organizationId: string) =>
    wrapCall<OrganizationPlanDetail>("GET", `/api/v1/subscription/organizations/${organizationId}`),
  setPlan: (organizationId: string, body: SetPlanPayload) =>
    wrapCall<OrganizationPlanDetail>("PUT", `/api/v1/subscription/organizations/${organizationId}/plan`, body as unknown as Body),
  recordPayment: (organizationId: string, body: RecordPaymentPayload) =>
    wrapCall<OrganizationPlanDetail>(
      "POST",
      `/api/v1/subscription/organizations/${organizationId}/payments`,
      body as unknown as Body,
    ),
}
