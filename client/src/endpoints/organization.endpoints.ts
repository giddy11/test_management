// endpoints/organization.endpoints.ts — superadmin cross-org overview.
import { wrapCall } from "@/transport/http"
import type { FetchOrganizationsParams, OrganizationSummary } from "@/types/organization.types"

export const OrganizationEndpoints = {
  fetchAll: (params: FetchOrganizationsParams) =>
    wrapCall<OrganizationSummary[]>("GET", "/api/v1/organizations", params as Record<string, unknown>),
}
