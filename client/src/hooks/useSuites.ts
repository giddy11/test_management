import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { SuiteEndpoints } from "@/endpoints/testMgmt.endpoints"
import { ApiError } from "@/transport/http"
import type { CreateSuitePayload, UpdateSuitePayload } from "@/types/testMgmt.types"

const KEY = "suites"

export function useSuites(projectId: string, params: { search?: string } = {}) {
  return useQuery({
    queryKey: [KEY, projectId, params],
    queryFn: async () => {
      const res = await SuiteEndpoints.fetchAll({ projectId, limit: 100, ...params })
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return res.data ?? []
    },
    enabled: Boolean(projectId),
  })
}

// Number of suites the caller can see in the project, regardless of any search —
// for the tab label. The list hook above returns bare rows with no total.
export function useSuiteTotal(projectId: string) {
  return useQuery({
    queryKey: [KEY, "total", projectId],
    queryFn: async () => {
      const res = await SuiteEndpoints.fetchAll({ projectId, limit: 1 })
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return res.meta?.total ?? 0
    },
    enabled: Boolean(projectId),
  })
}

export function useSuite(id: string) {
  return useQuery({
    queryKey: [KEY, "detail", id],
    queryFn: async () => {
      const res = await SuiteEndpoints.fetchById(id)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode)
      return res.data
    },
    enabled: Boolean(id),
  })
}

export function useCreateSuite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateSuitePayload) => {
      const res = await SuiteEndpoints.create(payload)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  })
}

export function useUpdateSuite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: UpdateSuitePayload }) => {
      const res = await SuiteEndpoints.update(id, payload)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  })
}

export function useDeleteSuite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await SuiteEndpoints.remove(id)
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return res
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  })
}
