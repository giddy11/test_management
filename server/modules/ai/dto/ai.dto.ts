// modules/ai/dto/ai.dto.ts
// What the API returns about AI. A key is NEVER returned — only its last four
// characters — and the sealed ciphertext never leaves the repository layer.
import { AI_PROVIDER_LABELS, type AiModelInfo, type AiProviderId } from "../../../infrastructure/ai/aiProvider";
import type { AiCredential } from "../entities/aiCredential.entity";
import type { AiKeySource } from "../domain/aiErrors";

export interface AiCredentialDTO {
  provider: AiProviderId;
  providerLabel: string;
  model: string;
  chatModel: string | null;
  featureModels: Record<string, string>;
  baseUrl: string | null;
  keyLast4: string;
  isActive: boolean;
  updatedAt: Date;
}

export function toCredentialDTO(row: AiCredential): AiCredentialDTO {
  return {
    provider: row.provider,
    providerLabel: AI_PROVIDER_LABELS[row.provider],
    model: row.model,
    chatModel: row.chatModel,
    featureModels: row.featureModels ?? {},
    baseUrl: row.baseUrl,
    keyLast4: row.keyLast4,
    isActive: row.isActive,
    updatedAt: row.updatedAt,
  };
}

export interface AiCredentialListDTO {
  // false when AI_KEYS_SECRET is unset: keys can't be saved, AI is off.
  storageReady: boolean;
  keys: AiCredentialDTO[];
}

export interface AiModelListDTO {
  models: AiModelInfo[];
}

export interface AiStatusDTO {
  available: boolean;
  source: AiKeySource | null;
  provider: AiProviderId | null;
  providerLabel: string | null;
  model: string | null;
  storageReady: boolean;
  // Phase 2 (credits) fills this in; null = no metering.
  credits: { balance: number; price: number } | null;
}
