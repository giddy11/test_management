// hooks/useOrganizations.ts — React Query bridge for the superadmin's cross-org overview.
import { useQuery } from "@tanstack/react-query"
import { OrganizationEndpoints } from "@/endpoints/organization.endpoints"
import { ApiError } from "@/transport/http"
import type { FetchOrganizationsParams } from "@/types/organization.types"

export function useOrganizations(params: FetchOrganizationsParams) {
  return useQuery({
    queryKey: ["organizations", params],
    queryFn: async () => {
      const res = await OrganizationEndpoints.fetchAll(params)
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return { data: res.data ?? [], meta: res.meta }
    },
  })
}
