// infrastructure/ai/modelTiers.ts
// Reads a rough capability tier from a model's NAME, so the settings UI can
// say "capable / balanced / fast". Providers don't publish a tier, so this is
// advice only: nothing may depend on it except the advice text.
import type { AiModelTier, AiProviderId } from "./aiProvider";

export function modelTier(provider: AiProviderId, modelId: string): AiModelTier | null {
  const id = modelId.toLowerCase();
  switch (provider) {
    case "anthropic":
      if (id.includes("haiku")) return "fast";
      if (id.includes("sonnet")) return "balanced";
      if (/opus|fable|mythos/.test(id)) return "capable";
      return null;
    case "openai":
      if (/(nano|mini)/.test(id)) return "fast";
      if (/^(gpt-|o\d)/.test(id)) return "capable";
      return null;
    case "gemini":
      if (/flash-(lite|8b)/.test(id)) return "fast";
      if (id.includes("flash")) return "balanced";
      if (/(pro|ultra)/.test(id)) return "capable";
      return null;
    default:
      return null; // Ollama: open models vary too much to guess
  }
}
