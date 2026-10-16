// infrastructure/ai/tests/providers.spec.ts
// The pure parts of the provider layer: error normalisation per vendor, image
// placement, model filtering, Ollama's context sizing, the SSRF guard and tiers.
// No network: nothing here constructs a client.
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { ApiError } from "@google/genai";
import { AiProviderError, isAccountProblem, kindFromStatus } from "../aiProvider";
import * as anthropic from "../anthropicProvider";
import * as openai from "../openaiProvider";
import * as gemini from "../geminiProvider";
import * as ollama from "../ollamaProvider";
import { checkServerAddress } from "../serverAddress";
import { modelTier } from "../modelTiers";

const IMG = { mimeType: "image/png" as const, data: "aGVsbG8=" };

describe("kindFromStatus / isAccountProblem", () => {
  it.each([
    [401, "bad key", "auth"],
    [403, "forbidden", "auth"],
    [429, "slow down", "rate_limit"],
    [404, "model not found", "invalid_request"],
    [400, "bad request", "invalid_request"],
    [422, "unprocessable", "invalid_request"],
    [500, "boom", "unavailable"],
    [408, "timeout", "unavailable"],
    [undefined, "socket hang up", "unavailable"],
  ])("%s %s → %s", (status, message, kind) => {
    expect(kindFromStatus(status as number | undefined, message)).toBe(kind);
  });

  it("checks account wording before the status code", () => {
    expect(kindFromStatus(429, "You exceeded your current quota")).toBe("account");
    expect(kindFromStatus(400, "Your credit balance is too low")).toBe("account");
    expect(kindFromStatus(403, "This model requires a paid plan")).toBe("account");
    expect(isAccountProblem(402, "")).toBe(true);
  });
});

describe("anthropic", () => {
  it("normalises SDK errors by status", () => {
    const err = Anthropic.APIError.generate(401, { error: { message: "invalid x-api-key" } }, "invalid x-api-key", new Headers());
    expect(anthropic.normalise(err).kind).toBe("auth");
  });

  it("passes an AiProviderError through untouched", () => {
    const original = new AiProviderError("refused", "stop_reason=refusal");
    expect(anthropic.normalise(original)).toBe(original);
  });

  it("puts images before the text", () => {
    const content = anthropic.userContent("describe", [IMG]);
    expect(content.map((b) => b.type)).toEqual(["image", "text"]);
  });
});

describe("openai", () => {
  it("normalises SDK errors by status", () => {
    const err = OpenAI.APIError.generate(429, { message: "Rate limit reached" }, "Rate limit reached", new Headers());
    expect(openai.normalise(err).kind).toBe("rate_limit");
  });

  it("puts images after the text, as data URLs", () => {
    const content = openai.userContent("describe", [IMG]);
    expect(content.map((p) => p.type)).toEqual(["text", "image_url"]);
    expect((content[1] as { image_url: { url: string } }).image_url.url).toBe("data:image/png;base64,aGVsbG8=");
  });

  it("keeps only text-chat models", () => {
    expect(openai.isChatModel("gpt-5")).toBe(true);
    expect(openai.isChatModel("o4-mini")).toBe(true);
    expect(openai.isChatModel("text-embedding-3-large")).toBe(false);
    expect(openai.isChatModel("gpt-4o-realtime-preview")).toBe(false);
    expect(openai.isChatModel("gpt-image-1")).toBe(false);
    expect(openai.isChatModel("whisper-1")).toBe(false);
  });
});

describe("gemini", () => {
  it("treats a 400 'API key not valid' as a rejected key", () => {
    const err = new ApiError({ message: "API key not valid. Please pass a valid API key.", status: 400 });
    expect(gemini.normalise(err).kind).toBe("auth");
  });

  it("still reads quota wording as an account problem", () => {
    const err = new ApiError({ message: "Quota exceeded for this API key", status: 429 });
    expect(gemini.normalise(err).kind).toBe("account");
  });

  it("puts images in inlineData parts", () => {
    const parts = gemini.userParts("describe", [IMG]);
    expect(parts[0]).toEqual({ text: "describe" });
    expect(parts[1]).toEqual({ inlineData: { mimeType: "image/png", data: "aGVsbG8=" } });
  });

  it("keeps only gemini text models that can generate content", () => {
    expect(gemini.isChatModel("gemini-2.5-pro", ["generateContent"])).toBe(true);
    expect(gemini.isChatModel("gemini-2.5-flash-preview-tts", ["generateContent"])).toBe(false);
    expect(gemini.isChatModel("gemini-embedding-001", ["embedContent"])).toBe(false);
    expect(gemini.isChatModel("imagen-4", ["predict"])).toBe(false);
  });
});

describe("ollama", () => {
  it("normalises ResponseError-shaped errors by status_code", () => {
    const err = Object.assign(new Error("unauthorized"), { name: "ResponseError", status_code: 401 });
    expect(ollama.normalise(err).kind).toBe("auth");
    const network = new TypeError("fetch failed");
    expect(ollama.normalise(network).kind).toBe("unavailable");
  });

  it("leaves the default context alone for a short prompt", () => {
    expect(ollama.contextFor(3000, 2048)).toBeUndefined();
  });

  it("raises num_ctx for a long prompt, rounded up to 1024 and capped", () => {
    expect(ollama.contextFor(30_000, 2048)).toBe(12 * 1024); // 10000 + 2048 = 12048 → 12288
    expect(ollama.contextFor(10_000_000, 2048)).toBe(32768);
    expect(ollama.contextFor(3000, 2048, 2)).toBe(6 * 1024); // 1000 + 2048 + 3000 for two images = 6048
  });

  it("spells the schema out in the system prompt", () => {
    const system = ollama.systemWithSchema("Be useful.", { type: "object" });
    expect(system).toContain("Be useful.");
    expect(system).toContain('{"type":"object"}');
  });
});

describe("checkServerAddress", () => {
  it("accepts a public https address and normalises it", () => {
    expect(checkServerAddress("https://ollama.com/", false)).toEqual({ url: "https://ollama.com" });
    expect(checkServerAddress(" https://llm.example.com/api/ ", false)).toEqual({ url: "https://llm.example.com/api" });
  });

  it.each([
    "http://llm.example.com",
    "https://localhost:11434",
    "https://127.0.0.1",
    "https://10.0.0.5",
    "https://192.168.1.10",
    "https://172.16.0.1",
    "https://169.254.169.254",
    "https://[::1]",
    "https://box.internal",
  ])("blocks %s in production", (address) => {
    expect(checkServerAddress(address, false)).toHaveProperty("problem");
  });

  it("allows a local server in development", () => {
    expect(checkServerAddress("http://localhost:11434", true)).toEqual({ url: "http://localhost:11434" });
  });

  it("rejects credentials in the URL, other schemes and junk", () => {
    expect(checkServerAddress("https://user:pass@ollama.com", true)).toHaveProperty("problem");
    expect(checkServerAddress("ftp://ollama.com", true)).toHaveProperty("problem");
    expect(checkServerAddress("not a url", true)).toHaveProperty("problem");
  });
});

describe("modelTier", () => {
  it.each([
    ["anthropic", "claude-haiku-5-5", "fast"],
    ["anthropic", "claude-sonnet-5-5", "balanced"],
    ["anthropic", "claude-opus-5-5", "capable"],
    ["openai", "gpt-5-mini", "fast"],
    ["openai", "gpt-5", "capable"],
    ["gemini", "gemini-2.5-flash-lite", "fast"],
    ["gemini", "gemini-2.5-flash", "balanced"],
    ["gemini", "gemini-2.5-pro", "capable"],
    ["ollama", "llama3.3", null],
    ["openai", "davinci-002", null],
  ] as const)("%s %s → %s", (provider, model, tier) => {
    expect(modelTier(provider, model)).toBe(tier);
  });
});
