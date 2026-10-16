// infrastructure/ai/aiProvider.ts
// The one contract every AI vendor sits behind. Feature code never imports a
// vendor SDK — it calls AiService, which calls an AiProvider resolved from the
// registry (providers.ts). Adding a vendor = one adapter file + one registry line.
//
// Adapters are stateless: the API key belongs to whoever is asking, so each
// call builds its own SDK client and nothing is shared between requests.

export const AI_PROVIDERS = ["anthropic", "openai", "gemini", "ollama"] as const;
export type AiProviderId = (typeof AI_PROVIDERS)[number];

export const AI_PROVIDER_LABELS: Record<AiProviderId, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  gemini: "Google Gemini",
  ollama: "Ollama",
};

export interface AiImage {
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  data: string; // base64, no data: prefix
}

export interface AiGenerateRequest {
  model: string;
  timeoutMs?: number; // default: env.ai.requestTimeoutMs
  baseUrl?: string; // Ollama only
  system: string;
  prompt: string;
  // A model that can't see images must fail with kind "invalid_request" so
  // AiService can retry without them.
  images?: AiImage[];
  schemaName: string;
  // Every property listed in `required`, additionalProperties:false — the
  // strictest vendor (OpenAI strict mode) needs that, so all of them get it.
  jsonSchema: Record<string, unknown>;
  maxOutputTokens: number;
}

export interface AiGenerateResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export interface AiChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AiChatRequest {
  model: string;
  timeoutMs?: number;
  baseUrl?: string;
  system: string;
  messages: AiChatMessage[];
  maxOutputTokens: number;
}

export type AiModelTier = "capable" | "balanced" | "fast";

export interface AiModelInfo {
  id: string;
  label: string;
  tier?: AiModelTier | null;
}

export interface AiProvider {
  readonly id: AiProviderId;
  generate(apiKey: string, request: AiGenerateRequest): Promise<AiGenerateResult>;
  stream(apiKey: string, request: AiChatRequest, onText: (delta: string) => void): Promise<AiGenerateResult>;
  // Doubles as the API-key check: a bad key MUST fail with kind "auth".
  listModels(apiKey: string, baseUrl?: string): Promise<AiModelInfo[]>;
}

export type AiErrorKind =
  | "auth" // the key was rejected
  | "account" // plan, quota or balance on the account behind the key
  | "rate_limit"
  | "invalid_request" // the model, or this request, can't be run (incl. no vision)
  | "refused" // the model declined the content
  | "truncated" // hit the output limit before finishing
  | "unavailable"; // network, timeout, 5xx — anything else

// 402, or wording that means plan / quota / balance. Checked FIRST, because
// providers report this inconsistently as 400, 402, 403 or 429.
export function isAccountProblem(status: number | undefined, message: string): boolean {
  return (
    status === 402 ||
    /subscri|upgrade your|quota|billing|credit balance|insufficient (balance|credit|fund)|payment required|paid plan|free tier/i.test(
      message
    )
  );
}

// Shared tail of every adapter's normalise(): status → kind, after the
// adapter has handled its own vendor-specific cases.
export function kindFromStatus(status: number | undefined, message: string): AiErrorKind {
  if (isAccountProblem(status, message)) return "account";
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limit";
  if (status !== undefined && status >= 400 && status < 500 && status !== 408) return "invalid_request";
  return "unavailable";
}

export class AiProviderError extends Error {
  constructor(
    public readonly kind: AiErrorKind,
    // Provider's own message — for server logs only, never shown to a client.
    public readonly detail: string,
    public readonly status?: number
  ) {
    super(`AI provider error (${kind}): ${detail}`);
    this.name = "AiProviderError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// Message text of anything thrown, without assuming its shape.
export function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
