import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { BugEndpoints } from "@/endpoints/bug.endpoints"
import { ApiError } from "@/transport/http"
import type { BugSearchField, CreateBugPayload, ManageBugPayload } from "@/types/bug.types"
import type { BugStatus, BugSeverity, BugPriority } from "@/lib/enums"

export const BUGS_KEY = "bugs"

interface BugQuery {
  page?: number
  limit?: number
  status?: BugStatus
  severity?: BugSeverity
  priority?: BugPriority
  assignedToId?: string
  search?: string
  searchBy?: BugSearchField
}

export function useBugs(projectId: string, params: BugQuery = {}) {
  return useQuery({
    queryKey: [BUGS_KEY, projectId, params],
    queryFn: async () => {
      const res = await BugEndpoints.fetchAll({ projectId, limit: 20, ...params })
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return { data: res.data ?? [], meta: res.meta }
    },
    enabled: Boolean(projectId),
  })
}

export function useBug(id: string) {
  return useQuery({
    queryKey: [BUGS_KEY, "detail", id],
    queryFn: async () => {
      const res = await BugEndpoints.fetchById(id)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode)
      return res.data
    },
    enabled: Boolean(id),
  })
}

export function useBugByCode(code: string) {
  return useQuery({
    queryKey: [BUGS_KEY, "detail-by-code", code],
    queryFn: async () => {
      const res = await BugEndpoints.fetchByCode(code)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode)
      return res.data
    },
    enabled: Boolean(code),
  })
}

export function useCreateBug() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateBugPayload) => {
      const res = await BugEndpoints.create(payload)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [BUGS_KEY] }),
  })
}

export function useManageBug() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: ManageBugPayload }) => {
      const res = await BugEndpoints.manage(id, payload)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [BUGS_KEY] }),
  })
}

export function useDeleteBug() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await BugEndpoints.remove(id)
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return res
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [BUGS_KEY] }),
  })
}
