// infrastructure/ai/geminiProvider.ts
// Google Gemini adapter (Gemini Developer API, @google/genai). Structured
// output via responseJsonSchema; chat via generateContentStream, whose usage
// metadata is a running total (the last chunk is the bill).
import { ApiError, GoogleGenAI, type Content, type GenerateContentResponse, type Part } from "@google/genai";
import {
  AiProviderError,
  isAccountProblem,
  kindFromStatus,
  messageOf,
  type AiChatRequest,
  type AiGenerateRequest,
  type AiGenerateResult,
  type AiImage,
  type AiModelInfo,
  type AiProvider,
} from "./aiProvider";

const { env } = require("../../config/env");

function clientFor(apiKey: string, timeoutMs?: number): GoogleGenAI {
  return new GoogleGenAI({
    apiKey,
    // attempts includes the original request: 2 = one retry, like the others.
    httpOptions: { timeout: timeoutMs ?? env.ai.requestTimeoutMs, retryOptions: { attempts: 2 } },
  });
}

export function normalise(err: unknown): AiProviderError {
  if (err instanceof AiProviderError) return err;
  const message = messageOf(err);
  if (err instanceof ApiError) {
    // Gemini reports a bad key as 400 "API key not valid", not 401.
    if (!isAccountProblem(err.status, message) && /api[ _-]?key/i.test(message) && err.status === 400) {
      return new AiProviderError("auth", message, err.status);
    }
    return new AiProviderError(kindFromStatus(err.status, message), message, err.status);
  }
  return new AiProviderError("unavailable", message);
}

export function userParts(prompt: string, images: AiImage[] = []): Part[] {
  return [{ text: prompt }, ...images.map((img): Part => ({ inlineData: { mimeType: img.mimeType, data: img.data } }))];
}

const BLOCKED_FINISH = new Set(["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII"]);

function checkResponse(response: GenerateContentResponse | undefined): void {
  const blockReason = response?.promptFeedback?.blockReason;
  if (blockReason) throw new AiProviderError("refused", `blockReason=${blockReason}`);
  const finish = response?.candidates?.[0]?.finishReason as string | undefined;
  if (finish && BLOCKED_FINISH.has(finish)) throw new AiProviderError("refused", `finishReason=${finish}`);
  if (finish === "MAX_TOKENS") throw new AiProviderError("truncated", "finishReason=MAX_TOKENS");
}

function tokensOf(response: GenerateContentResponse | undefined) {
  const u = response?.usageMetadata;
  return {
    inputTokens: u?.promptTokenCount ?? 0,
    // Thinking models bill their reasoning as output.
    outputTokens: (u?.candidatesTokenCount ?? 0) + (u?.thoughtsTokenCount ?? 0),
  };
}

const NOT_CHAT = /(tts|image|audio|embedding|live|native-audio|robotics|computer-use)/;

export function isChatModel(id: string, supportedActions: string[] | undefined): boolean {
  return id.startsWith("gemini") && !!supportedActions?.includes("generateContent") && !NOT_CHAT.test(id);
}

export const geminiProvider: AiProvider = {
  id: "gemini",

  async generate(apiKey: string, r: AiGenerateRequest): Promise<AiGenerateResult> {
    try {
      const response = await clientFor(apiKey, r.timeoutMs).models.generateContent({
        model: r.model,
        contents: [{ role: "user", parts: userParts(r.prompt, r.images) }],
        config: {
          systemInstruction: r.system,
          responseMimeType: "application/json",
          responseJsonSchema: r.jsonSchema,
          maxOutputTokens: r.maxOutputTokens,
        },
      });
      checkResponse(response);
      return { text: response.text ?? "", ...tokensOf(response) };
    } catch (err) {
      throw normalise(err);
    }
  },

  async stream(apiKey: string, r: AiChatRequest, onText: (delta: string) => void): Promise<AiGenerateResult> {
    try {
      const contents: Content[] = r.messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));
      const stream = await clientFor(apiKey, r.timeoutMs).models.generateContentStream({
        model: r.model,
        contents,
        config: { systemInstruction: r.system, maxOutputTokens: r.maxOutputTokens },
      });
      let text = "";
      let last: GenerateContentResponse | undefined;
      for await (const chunk of stream) {
        last = chunk;
        checkResponse(chunk);
        const delta = chunk.text;
        if (delta) {
          text += delta;
          onText(delta);
        }
      }
      return { text, ...tokensOf(last) };
    } catch (err) {
      throw normalise(err);
    }
  },

  async listModels(apiKey: string): Promise<AiModelInfo[]> {
    try {
      const models: AiModelInfo[] = [];
      for await (const m of await clientFor(apiKey, 30_000).models.list()) {
        const id = (m.name ?? "").replace(/^models\//, "");
        if (isChatModel(id, m.supportedActions)) models.push({ id, label: m.displayName || id });
      }
      return models;
    } catch (err) {
      throw normalise(err);
    }
  },
};
