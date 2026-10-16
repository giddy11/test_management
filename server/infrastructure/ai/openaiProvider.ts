// infrastructure/ai/openaiProvider.ts
// OpenAI adapter (Chat Completions). Structured output via a strict
// json_schema response_format; streaming with include_usage so the final
// (choice-less) chunk carries the token counts.
import OpenAI from "openai";
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

function clientFor(apiKey: string, timeoutMs?: number): OpenAI {
  return new OpenAI({ apiKey, timeout: timeoutMs ?? env.ai.requestTimeoutMs, maxRetries: 1 });
}

export function normalise(err: unknown): AiProviderError {
  if (err instanceof AiProviderError) return err;
  if (err instanceof OpenAI.APIError) {
    const message = messageOf(err);
    return new AiProviderError(kindFromStatus(err.status, message), message, err.status);
  }
  return new AiProviderError("unavailable", messageOf(err));
}

// Text first, then images as data URLs.
export function userContent(prompt: string, images: AiImage[] = []): OpenAI.ChatCompletionContentPart[] {
  return [
    { type: "text", text: prompt },
    ...images.map(
      (img): OpenAI.ChatCompletionContentPartImage => ({
        type: "image_url",
        image_url: { url: `data:${img.mimeType};base64,${img.data}` },
      })
    ),
  ];
}

function checkFinish(finishReason: string | null | undefined, refusal?: string | null): void {
  if (finishReason === "content_filter" || refusal) {
    throw new AiProviderError("refused", refusal || "finish_reason=content_filter");
  }
  if (finishReason === "length") {
    throw new AiProviderError("truncated", "finish_reason=length");
  }
}

// Vendor lists include embedding, audio, image and moderation models — keep
// only the ones that can hold a text conversation.
const CHAT_MODEL = /^(gpt-|o\d|chatgpt-)/;
const NOT_CHAT = /(audio|realtime|tts|transcribe|image|embedding|instruct|search|moderation)/;

export function isChatModel(id: string): boolean {
  return CHAT_MODEL.test(id) && !NOT_CHAT.test(id);
}

export const openaiProvider: AiProvider = {
  id: "openai",

  async generate(apiKey: string, r: AiGenerateRequest): Promise<AiGenerateResult> {
    try {
      const completion = await clientFor(apiKey, r.timeoutMs).chat.completions.create({
        model: r.model,
        max_completion_tokens: r.maxOutputTokens,
        messages: [
          { role: "system", content: r.system },
          { role: "user", content: userContent(r.prompt, r.images) },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: r.schemaName, schema: r.jsonSchema, strict: true },
        },
      });
      const choice = completion.choices[0];
      checkFinish(choice?.finish_reason, choice?.message?.refusal);
      return {
        text: choice?.message?.content ?? "",
        inputTokens: completion.usage?.prompt_tokens ?? 0,
        outputTokens: completion.usage?.completion_tokens ?? 0,
      };
    } catch (err) {
      throw normalise(err);
    }
  },

  async stream(apiKey: string, r: AiChatRequest, onText: (delta: string) => void): Promise<AiGenerateResult> {
    try {
      const stream = await clientFor(apiKey, r.timeoutMs).chat.completions.create({
        model: r.model,
        max_completion_tokens: r.maxOutputTokens,
        stream: true,
        stream_options: { include_usage: true },
        messages: [
          { role: "system", content: r.system },
          ...r.messages.map((m) => ({ role: m.role, content: m.content })),
        ],
      });
      let text = "";
      let inputTokens = 0;
      let outputTokens = 0;
      let finishReason: string | null = null;
      let refusal = "";
      for await (const chunk of stream) {
        const choice = chunk.choices[0];
        if (choice) {
          const delta = choice.delta?.content;
          if (delta) {
            text += delta;
            onText(delta);
          }
          if (choice.delta?.refusal) refusal += choice.delta.refusal;
          if (choice.finish_reason) finishReason = choice.finish_reason;
        }
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens;
          outputTokens = chunk.usage.completion_tokens;
        }
      }
      checkFinish(finishReason, refusal || null);
      return { text, inputTokens, outputTokens };
    } catch (err) {
      throw normalise(err);
    }
  },

  async listModels(apiKey: string): Promise<AiModelInfo[]> {
    try {
      const all: { id: string; created: number }[] = [];
      for await (const m of clientFor(apiKey, 30_000).models.list()) {
        if (isChatModel(m.id)) all.push({ id: m.id, created: m.created });
      }
      return all.sort((a, b) => b.created - a.created).map((m) => ({ id: m.id, label: m.id }));
    } catch (err) {
      throw normalise(err);
    }
  },
};
