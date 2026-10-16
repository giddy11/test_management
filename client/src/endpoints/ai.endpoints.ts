// endpoints/ai.endpoints.ts — AI settings: provider keys, per-feature models, credits.
// Key scope "org" hits /ai/org/… (ai.managekeys), "own" hits /ai/me/… (ai.ownkey).
import { wrapCall } from "@/transport/http"
import type {
  AiCreditAccount,
  AiCreditsSummary,
  AiCredential,
  AiCredentialList,
  AiFeature,
  AiKeyScope,
  AiModelInfo,
  AiProviderId,
  AiStatus,
  GrantAiCreditsPayload,
  ListAiModelsPayload,
  SaveAiKeyPayload,
} from "@/types/ai.types"

const base = (scope: AiKeyScope) => `/api/v1/ai/${scope === "org" ? "org" : "me"}`

// Checking a key calls the provider, which can be slow.
const KEY_CHECK_TIMEOUT = 30_000

export const AiEndpoints = {
  status: (feature?: AiFeature) =>
    wrapCall<AiStatus>("GET", "/api/v1/ai/status", feature ? { feature } : undefined),

  // ── Keys ─────────────────────────────────────────────────────────────────────
  keys: (scope: AiKeyScope) => wrapCall<AiCredentialList>("GET", `${base(scope)}/credentials`),

  models: (scope: AiKeyScope, provider: AiProviderId, payload: ListAiModelsPayload) =>
    wrapCall<{ models: AiModelInfo[] }>(
      "POST",
      `${base(scope)}/credentials/${provider}/models`,
      payload as unknown as Record<string, unknown>,
      { timeoutMs: KEY_CHECK_TIMEOUT }
    ),

  saveKey: (scope: AiKeyScope, provider: AiProviderId, payload: SaveAiKeyPayload) =>
    wrapCall<AiCredential>("PUT", `${base(scope)}/credentials/${provider}`, payload as unknown as Record<string, unknown>, {
      timeoutMs: KEY_CHECK_TIMEOUT,
    }),

  activateKey: (scope: AiKeyScope, provider: AiProviderId) =>
    wrapCall<null>("POST", `${base(scope)}/credentials/${provider}/activate`),

  removeKey: (scope: AiKeyScope, provider: AiProviderId) =>
    wrapCall<null>("DELETE", `${base(scope)}/credentials/${provider}`),

  setFeatureModel: (scope: AiKeyScope, feature: AiFeature, provider: AiProviderId, model: string) =>
    wrapCall<null>("PUT", `${base(scope)}/feature-models/${feature}`, { provider, model }),

  clearFeatureModel: (scope: AiKeyScope, feature: AiFeature) =>
    wrapCall<null>("DELETE", `${base(scope)}/feature-models/${feature}`),

  // ── Credits ──────────────────────────────────────────────────────────────────
  myCredits: (page: number, limit: number) =>
    wrapCall<AiCreditsSummary>("GET", "/api/v1/ai/me/credits", { page, limit }),

  clearCreditHistory: (dryRun: boolean) =>
    wrapCall<{ count: number }>("POST", "/api/v1/ai/me/credits/clear-history", { dryRun }),

  creditAccounts: (params: { search?: string; page: number; limit: number }) =>
    wrapCall<AiCreditAccount[]>("GET", "/api/v1/ai/org/credits/accounts", params),

  grantCredits: (payload: GrantAiCreditsPayload) =>
    wrapCall<{ userId: string; balance: number }>(
      "POST",
      "/api/v1/ai/org/credits/grants",
      payload as unknown as Record<string, unknown>
    ),

  creditPrices: () => wrapCall<Record<AiFeature, number>>("GET", "/api/v1/ai/org/credits/prices"),

  updateCreditPrices: (prices: Record<AiFeature, number>) =>
    wrapCall<Record<AiFeature, number>>("PUT", "/api/v1/ai/org/credits/prices", { prices }),
}
