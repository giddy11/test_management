// hooks/useAi.ts — React Query bridge for AI settings (keys, models, credits).
//
// Errors are thrown as ApiError and NOT toasted here: key and model errors are
// shown beside the field they belong to, so each component decides.
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AiEndpoints } from "@/endpoints/ai.endpoints"
import { ApiError } from "@/transport/http"
import type {
  AiFeature,
  AiKeyScope,
  AiProviderId,
  GrantAiCreditsPayload,
  ListAiModelsPayload,
  SaveAiKeyPayload,
} from "@/types/ai.types"

const AI_KEY = "ai"
// Separate from AI_KEY on purpose: listing a key's models calls the provider,
// so it must not refetch every time something else about AI changes.
const AI_MODELS_KEY = "ai-models"

function unwrap<T>(res: { success: boolean; data: T | null; message: string; statusCode: number; errors: ApiError["errors"] }): T {
  if (!res.success || res.data === null) throw new ApiError(res.message, res.statusCode, res.errors)
  return res.data
}

function ok(res: { success: boolean; message: string; statusCode: number; errors: ApiError["errors"] }) {
  if (!res.success) throw new ApiError(res.message, res.statusCode, res.errors)
}

export function useAiStatus(feature?: AiFeature, enabled = true) {
  return useQuery({
    queryKey: [AI_KEY, "status", feature ?? null],
    queryFn: async () => unwrap(await AiEndpoints.status(feature)),
    staleTime: 60_000,
    enabled,
  })
}

// ── Keys ──────────────────────────────────────────────────────────────────────

export function useAiKeys(scope: AiKeyScope, enabled = true) {
  return useQuery({
    queryKey: [AI_KEY, "keys", scope],
    queryFn: async () => unwrap(await AiEndpoints.keys(scope)),
    enabled,
  })
}

// Models available on a SAVED key — loaded only when asked for.
export function useAiKeyModels(scope: AiKeyScope, provider: AiProviderId | null, enabled: boolean) {
  return useQuery({
    queryKey: [AI_MODELS_KEY, scope, provider],
    queryFn: async () => unwrap(await AiEndpoints.models(scope, provider as AiProviderId, {})).models,
    enabled: enabled && provider !== null,
    staleTime: 10 * 60_000,
    retry: false,
  })
}

// Checks a TYPED key with the provider and returns its models.
export function useCheckAiKey(scope: AiKeyScope) {
  return useMutation({
    mutationFn: async (vars: { provider: AiProviderId } & ListAiModelsPayload) => {
      const { provider, ...payload } = vars
      return unwrap(await AiEndpoints.models(scope, provider, payload)).models
    },
  })
}

export function useSaveAiKey(scope: AiKeyScope) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { provider: AiProviderId } & SaveAiKeyPayload) => {
      const { provider, ...payload } = vars
      return unwrap(await AiEndpoints.saveKey(scope, provider, payload))
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: [AI_KEY] })
      qc.invalidateQueries({ queryKey: [AI_MODELS_KEY, scope, vars.provider] })
    },
  })
}

export function useActivateAiKey(scope: AiKeyScope) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (provider: AiProviderId) => ok(await AiEndpoints.activateKey(scope, provider)),
    onSuccess: () => qc.invalidateQueries({ queryKey: [AI_KEY] }),
  })
}

export function useRemoveAiKey(scope: AiKeyScope) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (provider: AiProviderId) => ok(await AiEndpoints.removeKey(scope, provider)),
    onSuccess: (_d, provider) => {
      qc.invalidateQueries({ queryKey: [AI_KEY] })
      qc.removeQueries({ queryKey: [AI_MODELS_KEY, scope, provider] })
    },
  })
}

// target null = the feature goes back to the key in use.
export function useSetAiFeatureModel(scope: AiKeyScope) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { feature: AiFeature; target: { provider: AiProviderId; model: string } | null }) =>
      ok(
        vars.target
          ? await AiEndpoints.setFeatureModel(scope, vars.feature, vars.target.provider, vars.target.model)
          : await AiEndpoints.clearFeatureModel(scope, vars.feature)
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: [AI_KEY] }),
  })
}

// ── Credits ───────────────────────────────────────────────────────────────────

export function useMyAiCredits(page: number, limit = 10, enabled = true) {
  return useQuery({
    queryKey: [AI_KEY, "credits", "mine", page, limit],
    queryFn: async () => {
      const res = await AiEndpoints.myCredits(page, limit)
      return { summary: unwrap(res), meta: res.meta }
    },
    placeholderData: keepPreviousData,
    enabled,
  })
}

export function useClearAiCreditHistory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (dryRun: boolean) => unwrap(await AiEndpoints.clearCreditHistory(dryRun)),
    onSuccess: (_d, dryRun) => {
      if (!dryRun) qc.invalidateQueries({ queryKey: [AI_KEY, "credits"] })
    },
  })
}

export function useAiCreditAccounts(params: { search?: string; page: number; limit: number }, enabled = true) {
  return useQuery({
    queryKey: [AI_KEY, "credits", "accounts", params],
    queryFn: async () => {
      const res = await AiEndpoints.creditAccounts(params)
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return { data: res.data ?? [], meta: res.meta }
    },
    placeholderData: keepPreviousData,
    enabled,
  })
}

export function useGrantAiCredits() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: GrantAiCreditsPayload) => unwrap(await AiEndpoints.grantCredits(payload)),
    onSuccess: () => qc.invalidateQueries({ queryKey: [AI_KEY, "credits"] }),
  })
}

export function useAiCreditPrices(enabled = true) {
  return useQuery({
    queryKey: [AI_KEY, "credits", "prices"],
    queryFn: async () => unwrap(await AiEndpoints.creditPrices()),
    enabled,
  })
}

export function useUpdateAiCreditPrices() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (prices: Record<AiFeature, number>) => unwrap(await AiEndpoints.updateCreditPrices(prices)),
    // Prices change what the status and the credits cards show.
    onSuccess: () => qc.invalidateQueries({ queryKey: [AI_KEY] }),
  })
}
