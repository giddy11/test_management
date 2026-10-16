// infrastructure/ai/ollamaProvider.ts
// Ollama adapter: Ollama Cloud (https://ollama.com, bearer token) or someone's
// own server (baseUrl + optional bearer token). The address is validated by
// checkServerAddress before it is ever saved.
//
// Two Ollama-specific traps handled here:
//   - not every open model honours `format`, so the schema is ALSO spelled out
//     in the system prompt;
//   - the default context window (~4096 tokens) silently drops the START of a
//     longer prompt — which is where the instructions are — so num_ctx is
//     raised to fit (contextFor).
import { Ollama, type ChatResponse, type Message } from "ollama";
import {
  AiProviderError,
  kindFromStatus,
  messageOf,
  type AiChatRequest,
  type AiGenerateRequest,
  type AiGenerateResult,
  type AiModelInfo,
  type AiProvider,
} from "./aiProvider";
import { OLLAMA_CLOUD } from "./serverAddress";

const { env } = require("../../config/env");

const DEFAULT_CONTEXT = 4096;
const MAX_CONTEXT = 32768;

// The SDK has no timeout option, so wrap fetch with one (combined with any
// signal the SDK passes, e.g. its own abort()).
function timedFetch(timeoutMs: number): typeof fetch {
  return (input, init = {}) => {
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    return fetch(input, { ...init, signal });
  };
}

function clientFor(apiKey: string, baseUrl: string | undefined, timeoutMs?: number): Ollama {
  return new Ollama({
    host: baseUrl || OLLAMA_CLOUD,
    // A self-hosted server may have no auth at all.
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
    fetch: timedFetch(timeoutMs ?? env.ai.requestTimeoutMs),
  });
}

export function normalise(err: unknown): AiProviderError {
  if (err instanceof AiProviderError) return err;
  const message = messageOf(err);
  // ollama-js throws ResponseError { status_code } (not exported as a class).
  const status = (err as { status_code?: unknown })?.status_code;
  if (typeof status === "number") {
    return new AiProviderError(kindFromStatus(status, message), message, status);
  }
  return new AiProviderError("unavailable", message);
}

// Rough token estimate: ~3 chars per token, plus room for the reply and images.
export function contextFor(promptChars: number, maxOutputTokens: number, imageCount = 0): number | undefined {
  const estimate = Math.ceil(promptChars / 3) + Math.min(maxOutputTokens, 2048) + imageCount * 1500;
  if (estimate <= DEFAULT_CONTEXT) return undefined;
  return Math.min(MAX_CONTEXT, Math.ceil(estimate / 1024) * 1024);
}

export function systemWithSchema(system: string, jsonSchema: Record<string, unknown>): string {
  return (
    `${system}\n\nReply with one JSON object and nothing else: no explanation and no code fence. ` +
    `Include every field. It must match this JSON Schema:\n${JSON.stringify(jsonSchema)}`
  );
}

function checkDone(response: Pick<ChatResponse, "done_reason">): void {
  if (response.done_reason === "length") throw new AiProviderError("truncated", "done_reason=length");
}

export const ollamaProvider: AiProvider = {
  id: "ollama",

  async generate(apiKey: string, r: AiGenerateRequest): Promise<AiGenerateResult> {
    try {
      const system = systemWithSchema(r.system, r.jsonSchema);
      const images = (r.images ?? []).map((img) => img.data);
      const numCtx = contextFor(system.length + r.prompt.length, r.maxOutputTokens, images.length);
      const response = await clientFor(apiKey, r.baseUrl, r.timeoutMs).chat({
        model: r.model,
        stream: false,
        format: r.jsonSchema,
        messages: [
          { role: "system", content: system },
          { role: "user", content: r.prompt, ...(images.length ? { images } : {}) },
        ],
        options: { num_predict: r.maxOutputTokens, ...(numCtx ? { num_ctx: numCtx } : {}) },
      });
      checkDone(response);
      return {
        text: response.message?.content ?? "",
        inputTokens: response.prompt_eval_count ?? 0,
        outputTokens: response.eval_count ?? 0,
      };
    } catch (err) {
      throw normalise(err);
    }
  },

  async stream(apiKey: string, r: AiChatRequest, onText: (delta: string) => void): Promise<AiGenerateResult> {
    try {
      const messages: Message[] = [
        { role: "system", content: r.system },
        ...r.messages.map((m) => ({ role: m.role, content: m.content })),
      ];
      const chars = messages.reduce((n, m) => n + m.content.length, 0);
      const numCtx = contextFor(chars, r.maxOutputTokens);
      const stream = await clientFor(apiKey, r.baseUrl, r.timeoutMs).chat({
        model: r.model,
        stream: true,
        messages,
        options: { num_predict: r.maxOutputTokens, ...(numCtx ? { num_ctx: numCtx } : {}) },
      });
      let text = "";
      let inputTokens = 0;
      let outputTokens = 0;
      for await (const part of stream) {
        const delta = part.message?.content;
        if (delta) {
          text += delta;
          onText(delta);
        }
        if (part.done) {
          checkDone(part);
          inputTokens = part.prompt_eval_count ?? 0;
          outputTokens = part.eval_count ?? 0;
        }
      }
      return { text, inputTokens, outputTokens };
    } catch (err) {
      throw normalise(err);
    }
  },

  async listModels(apiKey: string, baseUrl?: string): Promise<AiModelInfo[]> {
    try {
      const { models } = await clientFor(apiKey, baseUrl, 30_000).list();
      return models.map((m) => ({ id: m.name, label: m.name }));
    } catch (err) {
      throw normalise(err);
    }
  },
};
