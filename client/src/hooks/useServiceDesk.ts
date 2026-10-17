// hooks/useServiceDesk.ts — React Query bridge for IT requests.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ServiceDeskEndpoints as E } from "@/endpoints/serviceDesk.endpoints"
import { ApiError } from "@/transport/http"
import type { ApiResponse } from "@/types/api.types"
import type { CategoryPayload, ItemPayload, ListRequestsParams, RequestPayload } from "@/types/serviceDesk.types"

const KEY = "service-desk"

// Unwraps the envelope; throws so React Query sees a failure.
async function data<T>(call: Promise<ApiResponse<T>>): Promise<T> {
  const res = await call
  if (!res.success || res.data === null) throw new ApiError(res.message, res.statusCode, res.errors)
  return res.data
}

async function page<T>(call: Promise<ApiResponse<T[]>>) {
  const res = await call
  if (!res.success) throw new ApiError(res.message, res.statusCode, res.errors)
  return { data: res.data ?? [], meta: res.meta }
}

// ── Settings ─────────────────────────────────────────────────────────────────
// Whether the module is on decides the sidebar section, so it's read by
// everyone who holds any IT-requests permission.
export function useServiceDeskSettings(enabled = true) {
  return useQuery({
    queryKey: [KEY, "settings"],
    queryFn: () => data(E.settings()),
    enabled,
    staleTime: 5 * 60_000,
  })
}

export function useUpdateServiceDeskSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (enabled: boolean) => data(E.updateSettings(enabled)),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  })
}

export function useServiceDeskCounts(enabled = true) {
  return useQuery({
    queryKey: [KEY, "counts"],
    queryFn: () => data(E.counts()),
    enabled,
    refetchInterval: 60_000,
  })
}

// ── Catalog ──────────────────────────────────────────────────────────────────
export function usePortalCatalog(enabled = true) {
  return useQuery({ queryKey: [KEY, "catalog", "portal"], queryFn: () => data(E.portalCatalog()), enabled })
}

export function useAdminCatalog() {
  return useQuery({ queryKey: [KEY, "catalog", "admin"], queryFn: () => data(E.adminCatalog()) })
}

function useCatalogMutation<V>(fn: (v: V) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY, "catalog"] }),
  })
}

export const useCreateCategory = () => useCatalogMutation((p: CategoryPayload) => data(E.createCategory(p)))
export const useUpdateCategory = () =>
  useCatalogMutation(({ id, ...p }: CategoryPayload & { id: string }) => data(E.updateCategory(id, p)))
export const useCreateItem = () => useCatalogMutation((p: ItemPayload) => data(E.createItem(p)))
export const useUpdateItem = () => useCatalogMutation(({ id, ...p }: ItemPayload & { id: string }) => data(E.updateItem(id, p)))

// ── People ───────────────────────────────────────────────────────────────────
export function useApproverCandidates(enabled = true) {
  return useQuery({ queryKey: [KEY, "people", "approvers"], queryFn: () => data(E.approverCandidates()), enabled })
}

export function useServiceAgents(enabled = true) {
  return useQuery({ queryKey: [KEY, "people", "agents"], queryFn: () => data(E.agents()), enabled })
}

export function useColleagues(search: string, enabled = true) {
  return useQuery({
    queryKey: [KEY, "people", "colleagues", search],
    queryFn: () => data(E.colleagues(search || undefined)),
    enabled,
    staleTime: 60_000,
  })
}

// ── Requests ─────────────────────────────────────────────────────────────────
export function useServiceRequests(params: ListRequestsParams, enabled = true) {
  return useQuery({ queryKey: [KEY, "requests", params], queryFn: () => page(E.list(params)), enabled })
}

export function useMyApprovals(state: "pending" | "decided", pageNo = 1, enabled = true) {
  return useQuery({ queryKey: [KEY, "approvals", state, pageNo], queryFn: () => page(E.approvals(state, pageNo)), enabled })
}

export function useServiceRequest(id: string | undefined) {
  return useQuery({
    queryKey: [KEY, "request", id],
    queryFn: () => data(E.detail(id as string)),
    enabled: Boolean(id),
  })
}

// Anything that changes a request refreshes every list, count and detail.
function useRequestMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY, "requests"] })
      qc.invalidateQueries({ queryKey: [KEY, "approvals"] })
      qc.invalidateQueries({ queryKey: [KEY, "request"] })
      qc.invalidateQueries({ queryKey: [KEY, "counts"] })
    },
  })
}

export const useCreateRequest = () =>
  useRequestMutation((p: RequestPayload & { submit: boolean }) => data(E.create(p)))
export const useUpdateDraft = () =>
  useRequestMutation(({ id, ...p }: Partial<RequestPayload> & { id: string }) => data(E.updateDraft(id, p)))
export const useSubmitRequest = () => useRequestMutation((id: string) => data(E.submit(id)))
export const useCancelRequest = () =>
  useRequestMutation(({ id, reason }: { id: string; reason: string | null }) => data(E.cancel(id, reason)))
export const useApproveRequest = () =>
  useRequestMutation(({ id, comment }: { id: string; comment: string | null }) => data(E.approve(id, comment)))
export const useRejectRequest = () =>
  useRequestMutation(({ id, comment }: { id: string; comment: string }) => data(E.reject(id, comment)))
export const useAssignRequest = () =>
  useRequestMutation(({ id, assigneeId }: { id: string; assigneeId: string | null }) => data(E.assign(id, assigneeId)))
export const useStartRequest = () => useRequestMutation((id: string) => data(E.start(id)))
export const useFulfilRequest = () =>
  useRequestMutation(({ id, note }: { id: string; note: string }) => data(E.fulfil(id, note)))
export const useCommentOnRequest = () =>
  useRequestMutation(({ id, body, internal }: { id: string; body: string; internal: boolean }) =>
    data(E.comment(id, body, internal))
  )
