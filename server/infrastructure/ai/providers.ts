// infrastructure/ai/providers.ts
// The adapter registry. Services take an AiProviderResolver in their
// constructor (defaulting to providerFor) so tests can inject a fake provider.
import type { AiProvider, AiProviderId } from "./aiProvider";
import { anthropicProvider } from "./anthropicProvider";
import { geminiProvider } from "./geminiProvider";
import { ollamaProvider } from "./ollamaProvider";
import { openaiProvider } from "./openaiProvider";

const providers: Record<AiProviderId, AiProvider> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
  gemini: geminiProvider,
  ollama: ollamaProvider,
};

export type AiProviderResolver = (id: AiProviderId) => AiProvider;

export const providerFor: AiProviderResolver = (id) => providers[id];
