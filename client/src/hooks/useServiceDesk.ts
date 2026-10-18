// hooks/useServiceDesk.ts — React Query bridge for IT requests.
import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { connectSocket } from "@/lib/socket"
import { ServiceDeskEndpoints as E, type GroupPayload, type PolicyPayload } from "@/endpoints/serviceDesk.endpoints"
import { ApiError } from "@/transport/http"
import type { ApiResponse } from "@/types/api.types"
import type {
  ApprovalRulesPatch,
  CategoryPayload,
  ItemPayload,
  ListRequestsParams,
  MessagePayload,
  RequestPayload,
  RuleActions,
  RuleConditions,
  RulePayload,
  RunKind,
  RunStatus,
  ServiceLevels,
} from "@/types/serviceDesk.types"

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

export function useUpdateApprovalRules() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (rules: ApprovalRulesPatch) => data(E.updateApprovalRules(rules)),
    // The pickers and the groups and policies they feed all depend on it.
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
export const useDeleteCategory = () => useCatalogMutation((id: string) => ok(E.deleteCategory(id)))
export const useDeleteItem = () => useCatalogMutation((id: string) => ok(E.deleteItem(id)))

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

// Can this item be submitted by me (for this colleague) right now? Asked before
// the form is filled in, so a missing line manager is found out early.
export function useSubmissionCheck(itemId: string | undefined, requestedForId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: [KEY, "check", itemId, requestedForId ?? null],
    queryFn: () => data(E.checkSubmission(itemId as string, requestedForId)),
    enabled: enabled && Boolean(itemId),
    // Never trusted from the cache: someone who has just had a manager set must be able to go ahead.
    staleTime: 0,
  })
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

// A colleague's comment reaches an open request page without a reload. The
// server's event names the request only; the page refetches it, and the normal
// endpoint decides what this viewer may read. A reconnect refetches too, since
// events sent while the socket was down are gone.
export function useLiveRequest(id: string | undefined) {
  const qc = useQueryClient()
  useEffect(() => {
    if (!id) return
    const socket = connectSocket()
    const refresh = () => qc.invalidateQueries({ queryKey: [KEY, "request", id] })
    const onComment = (p: { requestId: string }) => {
      if (p.requestId === id) refresh()
    }
    socket.on("service-request:comment", onComment)
    socket.on("connect", refresh)
    return () => {
      socket.off("service-request:comment", onComment)
      socket.off("connect", refresh)
    }
  }, [id, qc])
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
export const useProvideInfo = () =>
  useRequestMutation(({ id, answer }: { id: string; answer: string }) => data(E.provideInfo(id, answer)))
export const useUploadRequestFiles = () =>
  useRequestMutation(({ id, files }: { id: string; files: File[] }) => data(E.uploadAttachments(id, files)))
export const useDeleteRequestFile = () =>
  useRequestMutation(async ({ id, attachmentId }: { id: string; attachmentId: string }) => {
    const res = await E.deleteAttachment(id, attachmentId)
    if (!res.success) throw new ApiError(res.message, res.statusCode, res.errors)
  })

// ── Service levels, approval setup, delegation, reports ─────────────────────
export function useUpdateServiceLevels() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (levels: ServiceLevels) => data(E.updateServiceLevels(levels)),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY, "settings"] }),
  })
}

export function useApproverGroups(enabled = true) {
  return useQuery({ queryKey: [KEY, "groups"], queryFn: () => data(E.groups()), enabled })
}

export function useApprovalPolicies(enabled = true) {
  return useQuery({ queryKey: [KEY, "policies"], queryFn: () => data(E.policies()), enabled })
}

function useSetupMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY, "groups"] })
      qc.invalidateQueries({ queryKey: [KEY, "policies"] })
      qc.invalidateQueries({ queryKey: [KEY, "catalog"] })
      qc.invalidateQueries({ queryKey: [KEY, "managers"] })
    },
  })
}

async function ok(call: Promise<ApiResponse<null>>) {
  const res = await call
  if (!res.success) throw new ApiError(res.message, res.statusCode, res.errors)
}

export const useSaveGroup = () =>
  useSetupMutation(({ id, ...p }: GroupPayload & { id?: string }) => data(id ? E.updateGroup(id, p) : E.createGroup(p)))
export const useDeleteGroup = () => useSetupMutation((id: string) => ok(E.deleteGroup(id)))
export const useSavePolicy = () =>
  useSetupMutation(({ id, ...p }: PolicyPayload & { id?: string }) => data(id ? E.updatePolicy(id, p) : E.createPolicy(p)))
export const useDeletePolicy = () => useSetupMutation((id: string) => ok(E.deletePolicy(id)))

export function useManagers(enabled = true) {
  return useQuery({ queryKey: [KEY, "managers"], queryFn: () => data(E.managers()), enabled })
}
export const useSetManager = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, managerId }: { userId: string; managerId: string | null }) => data(E.setManager(userId, managerId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY, "groups"] })
      qc.invalidateQueries({ queryKey: [KEY, "policies"] })
      qc.invalidateQueries({ queryKey: [KEY, "catalog"] })
      // Returned, so the mutation stays pending until the list has refetched and
      // the row never flashes its old manager between saving and showing the new one.
      return qc.invalidateQueries({ queryKey: [KEY, "managers"] })
    },
  })
}

export function useMyDelegation(enabled = true) {
  return useQuery({
    queryKey: [KEY, "delegation"],
    queryFn: async () => {
      const res = await E.myDelegation()
      if (!res.success) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
    enabled,
  })
}

export function useDelegateCandidates(enabled = true) {
  return useQuery({ queryKey: [KEY, "people", "delegates"], queryFn: () => data(E.delegateCandidates()), enabled })
}

export function useSetDelegation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: { delegateId: string; startsOn: string; endsOn: string; note: string | null }) => data(E.setDelegation(p)),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY, "delegation"] }),
  })
}

export function useClearDelegation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => ok(E.clearDelegation()),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY, "delegation"] }),
  })
}

export function useServiceDeskReport(range: { from?: string; to?: string }, enabled = true) {
  return useQuery({ queryKey: [KEY, "reports", range], queryFn: () => data(E.reports(range)), enabled })
}

// ── Automation (Phase 3) ─────────────────────────────────────────────────────
export function useAutomationRules(enabled = true) {
  return useQuery({ queryKey: [KEY, "automation", "rules"], queryFn: () => data(E.rules()), enabled })
}

export function useWebhookEndpoints(enabled = true) {
  return useQuery({ queryKey: [KEY, "automation", "endpoints"], queryFn: () => data(E.endpoints()), enabled })
}

export function useAutomationRuns(params: { status?: RunStatus; kind?: RunKind; page?: number }, enabled = true) {
  return useQuery({ queryKey: [KEY, "automation", "runs", params], queryFn: () => page(E.runs(params)), enabled })
}

function useAutomationMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY, "automation"] })
      qc.invalidateQueries({ queryKey: [KEY, "catalog"] })
    },
  })
}

export const useSaveRule = () =>
  useAutomationMutation(({ id, ...p }: RulePayload & { id?: string }) => data(id ? E.updateRule(id, p) : E.createRule(p)))
export const useDeleteRule = () => useAutomationMutation((id: string) => ok(E.deleteRule(id)))
export const useDryRun = () =>
  useMutation({ mutationFn: ({ conditions, actions }: { conditions: RuleConditions; actions: RuleActions }) => data(E.dryRun(conditions, actions)) })
export const useCreateEndpoint = () => useAutomationMutation((p: { name: string; url: string }) => data(E.createEndpoint(p)))
export const useUpdateEndpoint = () =>
  useAutomationMutation(({ id, ...p }: { id: string; name?: string; url?: string; isActive?: boolean }) => data(E.updateEndpoint(id, p)))
export const useRotateEndpointSecret = () => useAutomationMutation((id: string) => data(E.rotateEndpointSecret(id)))
export const useTestEndpoint = () => useAutomationMutation((id: string) => data(E.testEndpoint(id)))
export const useDeleteEndpoint = () => useAutomationMutation((id: string) => ok(E.deleteEndpoint(id)))

export const useRunAutomation = () => useRequestMutation((id: string) => data(E.runAutomation(id)))
export const useTakeOver = () => useRequestMutation((id: string) => data(E.takeOver(id)))
export const useClearReview = () => useRequestMutation((id: string) => data(E.clearReview(id)))
export const useRecordIdentityCheck = () =>
  useRequestMutation(({ id, method, note }: { id: string; method: string; note: string | null }) => data(E.recordIdentityCheck(id, method, note)))
export const useSelfService = () => useRequestMutation((itemId: string) => data(E.selfService(itemId)))
export const useAiIntake = () => useMutation({ mutationFn: (description: string) => data(E.aiIntake(description)) })
export const useAiTriage = () => useRequestMutation((id: string) => data(E.aiTriage(id)))

export const useCommentOnRequest = () =>
  useRequestMutation(({ id, ...message }: MessagePayload & { id: string }) => data(E.comment(id, message)))

export const useEditComment = () =>
  useRequestMutation(({ id, commentId, ...p }: { id: string; commentId: string; body: string; mentionIds: string[] }) =>
    data(E.editComment(id, commentId, p))
  )

export const useDeleteComment = () =>
  useRequestMutation(async ({ id, commentId }: { id: string; commentId: string }) => {
    const res = await E.deleteComment(id, commentId)
    if (!res.success) throw new ApiError(res.message, res.statusCode, res.errors)
  })
