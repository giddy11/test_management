// types/ai.types.ts — mirrors the server's AI DTOs (server/modules/ai/dto/ai.dto.ts).

export const AI_PROVIDERS = [
  { id: "anthropic", label: "Anthropic", pricingUrl: "https://www.anthropic.com/pricing#api" },
  { id: "openai", label: "OpenAI", pricingUrl: "https://openai.com/api/pricing/" },
  { id: "gemini", label: "Google Gemini", pricingUrl: "https://ai.google.dev/gemini-api/docs/pricing" },
  { id: "ollama", label: "Ollama", pricingUrl: "https://ollama.com/pricing" },
] as const

export type AiProviderId = (typeof AI_PROVIDERS)[number]["id"]

export const providerLabel = (id: AiProviderId) => AI_PROVIDERS.find((p) => p.id === id)?.label ?? id

// Mirrors AI_FEATURES in server/modules/ai/domain/features.ts — keep in step.
export const AI_FEATURES = [
  {
    id: "bug_report_draft",
    label: "Bug report drafts",
    description: "Turns a rough description into a structured bug report, and suggests bug descriptions.",
  },
  {
    id: "feature_request_draft",
    label: "Feature request drafts",
    description: "Turns a rough idea into a clear feature request with acceptance criteria.",
  },
] as const

export type AiFeature = (typeof AI_FEATURES)[number]["id"]

// "org" = the organisation's keys (ai.managekeys); "own" = the caller's (ai.ownkey).
export type AiKeyScope = "org" | "own"

export type AiModelTier = "capable" | "balanced" | "fast"

export interface AiModelInfo {
  id: string
  label: string
  tier?: AiModelTier | null
}

export interface AiCredential {
  provider: AiProviderId
  providerLabel: string
  model: string
  chatModel: string | null
  featureModels: Partial<Record<AiFeature, string>>
  baseUrl: string | null
  keyLast4: string
  isActive: boolean
  updatedAt: string
}

export interface AiCredentialList {
  // false when the server has no AI_KEYS_SECRET: keys can't be saved.
  storageReady: boolean
  keys: AiCredential[]
}

export interface SaveAiKeyPayload {
  apiKey?: string
  model: string
  chatModel?: string | null
  baseUrl?: string | null
  makeActive?: boolean
}

export interface ListAiModelsPayload {
  apiKey?: string
  baseUrl?: string | null
}

export interface AiStatus {
  available: boolean
  source: "user" | "organization" | null
  provider: AiProviderId | null
  providerLabel: string | null
  model: string | null
  storageReady: boolean
  credits: { balance: number; price: number } | null
}

// ── Drafts ────────────────────────────────────────────────────────────────────

// Common to every draft: which model wrote it and what it cost.
export interface AiDraftMeta {
  provider: AiProviderId
  model: string
  creditsCharged: number
}

// ── The assistant (whole-form drafts) ─────────────────────────────────────────

export interface FollowUpAnswer {
  question: string
  answer: string
}

// What every assistant draft carries besides the form's own fields.
export interface AssistantDraftExtras extends AiDraftMeta {
  evidenceSuggestion: string
  followUpQuestions: string[]
  // Fields that are the AI's suggestion rather than what the user said.
  needsConfirmation: string[]
}

export const BUG_SEVERITY_VALUES = ["Trivial", "Minor", "Major", "Critical"] as const
export const BUG_PRIORITY_VALUES = ["Low", "Medium", "High", "Urgent"] as const

export interface BugReportDraft extends AssistantDraftExtras {
  title: string
  description: string
  stepsToReproduce: string[]
  expectedBehavior: string
  actualBehavior: string
  environment: string
  severity: (typeof BUG_SEVERITY_VALUES)[number] | null
  priority: (typeof BUG_PRIORITY_VALUES)[number] | null
  severityReason: string
}

export interface BugReportDraftPayload {
  projectId: string
  roughDescription?: string
  answers?: FollowUpAnswer[]
  form: {
    title?: string
    description?: string
    stepsToReproduce?: string[]
    expectedBehavior?: string
    actualBehavior?: string
    environment?: string
  }
  testCaseId?: string
  suiteId?: string
  bugId?: string
}

export interface FeatureRequestDraft extends AssistantDraftExtras {
  title: string
  category: string
  sections: {
    problemStatement: string
    proposedSolution: string
    businessJustification: string
    expectedOutcome: string
    acceptanceCriteria: string[]
  }
  // The sections as headed Markdown, ready for the Description box.
  description: string
}

export interface FeatureRequestDraftPayload {
  projectId: string
  roughDescription?: string
  answers?: FollowUpAnswer[]
  form: { title?: string; description?: string; category?: string }
  suiteId?: string
  requestId?: string
}

// ── Usage report ──────────────────────────────────────────────────────────────

export type AiUsagePeriod = 7 | 30 | 90

export interface AiUsageReport {
  days: AiUsagePeriod
  since: string
  totals: {
    requests: number
    failed: number
    people: number
    ownKeyRequests: number
    teamSize: number
    failureRate: number // percent
    adoptionRate: number // percent of the team
  }
  byFeature: {
    feature: string
    requests: number
    succeeded: number
    failed: number
    avgMs: number | null
    p95Ms: number | null
    inputTokens: number
    outputTokens: number
    people: number
  }[]
  byDay: { day: string; requests: number; failed: number }[]
  errors: { errorKind: string; count: number }[]
}

// ── Credits ───────────────────────────────────────────────────────────────────

export type AiCreditTransactionType = "grant" | "adjustment" | "usage" | "refund" | "purchase"

export interface AiCreditHistoryEntry {
  id: string
  type: AiCreditTransactionType
  amount: number
  balanceAfter: number
  feature: string | null
  note: string | null
  projectName: string | null
  usedByName: string | null
  createdAt: string
}

export interface AiCreditsSummary {
  // false = the organisation hasn't priced anything; AI on its key is free.
  metered: boolean
  balance: number
  prices: Record<AiFeature, number>
  history: AiCreditHistoryEntry[]
}

export interface AiCreditAccount {
  userId: string
  name: string
  email: string
  balance: number
}

export interface GrantAiCreditsPayload {
  userId: string
  amount: number
  note?: string | null
}

export const credits = (n: number) => `${n} credit${Math.abs(n) === 1 ? "" : "s"}`

export const featureLabel = (id: string | null) =>
  AI_FEATURES.find((f) => f.id === id)?.label ?? id ?? ""

// Ollama Cloud — the default server when no address is given.
export const OLLAMA_CLOUD = "https://ollama.com"
