// hooks/useClientCompanies.ts — React Query bridge for client-company management.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ClientCompanyEndpoints } from "@/endpoints/clientCompany.endpoints"
import { ApiError } from "@/transport/http"
import type {
  CreateClientCompanyPayload,
  CreateSupporterPayload,
  UpdateClientCompanyPayload,
} from "@/types/clientCompany.types"

const COMPANIES_KEY = "clientCompanies"

// Self-service — an IT support lead's own company, for the support portal.
export function useMyClientCompany(enabled: boolean) {
  return useQuery({
    queryKey: [COMPANIES_KEY, "me"],
    queryFn: async () => {
      const res = await ClientCompanyEndpoints.fetchMine()
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode)
      return res.data
    },
    enabled,
  })
}

export function useClientCompanies(projectId: string) {
  return useQuery({
    queryKey: [COMPANIES_KEY, projectId],
    queryFn: async () => {
      const res = await ClientCompanyEndpoints.fetchAll(projectId)
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return res.data ?? []
    },
    enabled: Boolean(projectId),
  })
}

export function useCreateClientCompany() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateClientCompanyPayload) => {
      const res = await ClientCompanyEndpoints.create(payload)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [COMPANIES_KEY] }),
  })
}

export function useUpdateClientCompany() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: UpdateClientCompanyPayload }) => {
      const res = await ClientCompanyEndpoints.update(id, payload)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [COMPANIES_KEY] }),
  })
}

export function useDeleteClientCompany() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await ClientCompanyEndpoints.remove(id)
      if (!res.success) throw new ApiError(res.message, res.statusCode, res.errors)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [COMPANIES_KEY] }),
  })
}

export function useSetClientCompanyLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const res = await ClientCompanyEndpoints.setLink(id, enabled)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [COMPANIES_KEY] }),
  })
}

export function useSetAutoAssign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const res = await ClientCompanyEndpoints.setAutoAssign(id, enabled)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [COMPANIES_KEY] }),
  })
}

export function useSupporters(companyId: string, enabled: boolean) {
  return useQuery({
    queryKey: [COMPANIES_KEY, companyId, "supporters"],
    queryFn: async () => {
      const res = await ClientCompanyEndpoints.listSupporters(companyId)
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return res.data ?? []
    },
    enabled: enabled && Boolean(companyId),
  })
}

export function useCreateSupporter(companyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateSupporterPayload) => {
      const res = await ClientCompanyEndpoints.createSupporter(companyId, payload)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [COMPANIES_KEY] }),
  })
}

export function useRemoveSupporter(companyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (userId: string) => {
      const res = await ClientCompanyEndpoints.removeSupporter(companyId, userId)
      if (!res.success) throw new ApiError(res.message, res.statusCode, res.errors)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [COMPANIES_KEY] }),
  })
}

export function useSetSupporterLead(companyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, isSupportLead }: { userId: string; isSupportLead: boolean }) => {
      const res = await ClientCompanyEndpoints.setSupporterLead(companyId, userId, isSupportLead)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [COMPANIES_KEY] }),
  })
}
