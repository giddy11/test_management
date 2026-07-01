import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CaseEndpoints } from "@/endpoints/testMgmt.endpoints"
import { ApiError } from "@/transport/http"
import type { CreateCasePayload, UpdateCasePayload } from "@/types/testMgmt.types"
import type { TcPriority, TcStatus } from "@/lib/enums"

const KEY = "cases"

interface CaseQuery {
  page?: number
  limit?: number
  search?: string
  priority?: TcPriority
  status?: TcStatus
  runStatus?: string
}

export function useCases(suiteId: string, params: CaseQuery = {}) {
  return useQuery({
    queryKey: [KEY, suiteId, params],
    queryFn: async () => {
      const res = await CaseEndpoints.fetchAll({ suite: suiteId, limit: 20, ...params })
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return { data: res.data ?? [], meta: res.meta }
    },
    enabled: Boolean(suiteId),
  })
}

export function useCase(id: string) {
  return useQuery({
    queryKey: [KEY, "detail", id],
    queryFn: async () => {
      const res = await CaseEndpoints.fetchById(id)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode)
      return res.data
    },
    enabled: Boolean(id),
  })
}

export function useCreateCase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateCasePayload) => {
      const res = await CaseEndpoints.create(payload)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  })
}

export function useUpdateCase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: UpdateCasePayload }) => {
      const res = await CaseEndpoints.update(id, payload)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  })
}

export function useDeleteCase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await CaseEndpoints.remove(id)
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return res
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  })
}

export function useAssignCase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, userIds, deadline }: { id: string; userIds: string[]; deadline?: string | null }) => {
      const res = await CaseEndpoints.assign(id, userIds, deadline)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  })
}

export function useBulkAssignCases() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      caseIds,
      userIds,
      deadline,
    }: {
      caseIds: string[]
      userIds: string[]
      deadline?: string | null
    }) => {
      const results = await Promise.allSettled(
        caseIds.map((id) => CaseEndpoints.assign(id, userIds, deadline))
      )
      const failed = results.filter(
        (r) => r.status === "rejected" || (r.status === "fulfilled" && !r.value.success)
      ).length
      if (failed > 0) throw new ApiError(`${failed} of ${caseIds.length} could not be assigned`, 0)
      return { assigned: caseIds.length }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  })
}

export function useBulkDeleteCases() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.allSettled(ids.map((id) => CaseEndpoints.remove(id)))
      const failed = results.filter(
        (r) => r.status === "rejected" || (r.status === "fulfilled" && !r.value.success)
      ).length
      if (failed > 0) {
        throw new ApiError(`${failed} of ${ids.length} could not be deleted`, 0)
      }
      return { deleted: ids.length }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  })
}
