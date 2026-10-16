// infrastructure/ai/anthropicProvider.ts
// Anthropic (Claude) adapter. Structured output via output_config.format;
// chat via messages.stream with the system prompt cached (it's identical on
// every turn of a conversation).
//
// No `thinking` or `effort` is sent: the model is whatever the owner picked in
// settings, and older models reject parameters newer ones accept.
import Anthropic from "@anthropic-ai/sdk";
import {
  AiProviderError,
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

function clientFor(apiKey: string, timeoutMs?: number): Anthropic {
  return new Anthropic({
    apiKey,
    timeout: timeoutMs ?? env.ai.requestTimeoutMs,
    maxRetries: 1,
  });
}

export function normalise(err: unknown): AiProviderError {
  if (err instanceof AiProviderError) return err;
  if (err instanceof Anthropic.APIError) {
    const message = messageOf(err);
    return new AiProviderError(kindFromStatus(err.status, message), message, err.status);
  }
  return new AiProviderError("unavailable", messageOf(err));
}

// Images go BEFORE the text in the user turn.
export function userContent(prompt: string, images: AiImage[] = []): Anthropic.ContentBlockParam[] {
  return [
    ...images.map(
      (img): Anthropic.ImageBlockParam => ({
        type: "image",
        source: { type: "base64", media_type: img.mimeType, data: img.data },
      })
    ),
    { type: "text", text: prompt },
  ];
}

function resultOf(message: Anthropic.Message): AiGenerateResult {
  if (message.stop_reason === "refusal") {
    throw new AiProviderError("refused", "stop_reason=refusal");
  }
  if (message.stop_reason === "max_tokens") {
    throw new AiProviderError("truncated", "stop_reason=max_tokens");
  }
  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const u = message.usage;
  return {
    text,
    // Cached input is still input — count it for billing and logs.
    inputTokens: u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
    outputTokens: u.output_tokens,
  };
}

export const anthropicProvider: AiProvider = {
  id: "anthropic",

  async generate(apiKey: string, r: AiGenerateRequest): Promise<AiGenerateResult> {
    try {
      const message = await clientFor(apiKey, r.timeoutMs).messages.create({
        model: r.model,
        max_tokens: r.maxOutputTokens,
        system: r.system,
        messages: [{ role: "user", content: userContent(r.prompt, r.images) }],
        output_config: { format: { type: "json_schema", schema: r.jsonSchema } },
      });
      return resultOf(message);
    } catch (err) {
      throw normalise(err);
    }
  },

  async stream(apiKey: string, r: AiChatRequest, onText: (delta: string) => void): Promise<AiGenerateResult> {
    try {
      const stream = clientFor(apiKey, r.timeoutMs)
        .messages.stream({
          model: r.model,
          max_tokens: r.maxOutputTokens,
          system: [{ type: "text", text: r.system, cache_control: { type: "ephemeral" } }],
          messages: r.messages.map((m) => ({ role: m.role, content: m.content })),
        })
        .on("text", (delta) => onText(delta));
      return resultOf(await stream.finalMessage());
    } catch (err) {
      throw normalise(err);
    }
  },

  async listModels(apiKey: string): Promise<AiModelInfo[]> {
    try {
      const models: AiModelInfo[] = [];
      for await (const m of clientFor(apiKey, 30_000).models.list()) {
        models.push({ id: m.id, label: m.display_name || m.id });
      }
      return models;
    } catch (err) {
      throw normalise(err);
    }
  },
};
