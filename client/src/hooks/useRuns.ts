import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ResultEndpoints, RunEndpoints } from "@/endpoints/testMgmt.endpoints"
import { ApiError } from "@/transport/http"
import type { CreateRunPayload, RecordResultPayload } from "@/types/testMgmt.types"

const RUNS = "runs"
const RESULTS = "results"

export function useRuns(projectId: string) {
  return useQuery({
    queryKey: [RUNS, projectId],
    queryFn: async () => {
      const res = await RunEndpoints.fetchAll({ projectId, limit: 100 })
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return res.data ?? []
    },
    enabled: Boolean(projectId),
  })
}

export function useRun(id: string) {
  return useQuery({
    queryKey: [RUNS, "detail", id],
    queryFn: async () => {
      const res = await RunEndpoints.fetchById(id)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode)
      return res.data
    },
    enabled: Boolean(id),
  })
}

export function useCreateRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateRunPayload) => {
      const res = await RunEndpoints.create(payload)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [RUNS] }),
  })
}

export function useUpdateRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: { name?: string; status?: string } }) => {
      const res = await RunEndpoints.update(id, payload)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
    onSuccess: (run) => {
      qc.invalidateQueries({ queryKey: [RUNS] })
      qc.invalidateQueries({ queryKey: [RUNS, "detail", run.id] })
    },
  })
}

export function useDeleteRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await RunEndpoints.remove(id)
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return res
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [RUNS] }),
  })
}

export function useResults(runId: string) {
  return useQuery({
    queryKey: [RESULTS, runId],
    queryFn: async () => {
      const res = await ResultEndpoints.fetchAll({ runId, limit: 100 })
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return res.data ?? []
    },
    enabled: Boolean(runId),
  })
}

export function useRecordResult(runId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: RecordResultPayload }) => {
      const res = await ResultEndpoints.record(id, payload)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [RESULTS, runId] })
      qc.invalidateQueries({ queryKey: [RUNS, "detail", runId] })
    },
  })
}
