// modules/ai/validators/ai.schema.ts
// Request validation for the AI routes. Every free-text field is length-capped.
import { z } from "zod";
import { AI_PROVIDERS } from "../../../infrastructure/ai/aiProvider";
import { AI_FEATURES } from "../domain/features";
import { MAX_CREDIT_GRANT, MAX_CREDIT_PRICE } from "../domain/credits";

const provider = z.enum(AI_PROVIDERS);
const feature = z.enum(AI_FEATURES);
const modelId = z.string().trim().min(1, "Choose a model").max(200);
// Keys are trimmed: a pasted key often carries a trailing newline.
const apiKey = z.string().trim().max(500);
const baseUrl = z.string().trim().max(500);

export const providerParamsSchema = z.object({
  params: z.object({ provider }),
});

export const statusSchema = z.object({
  query: z.object({
    feature: feature.optional(),
  }),
});

export const saveCredentialSchema = z.object({
  params: z.object({ provider }),
  body: z.object({
    // Optional on update: change the model without retyping the key.
    apiKey: apiKey.optional(),
    model: modelId,
    chatModel: modelId.nullable().optional(),
    baseUrl: baseUrl.nullable().optional(),
    makeActive: z.boolean().optional(),
  }),
});

export const listModelsSchema = z.object({
  params: z.object({ provider }),
  body: z.object({
    // Omitted = use the saved key for this provider.
    apiKey: apiKey.optional(),
    baseUrl: baseUrl.nullable().optional(),
  }),
});

export const setFeatureModelSchema = z.object({
  params: z.object({ feature }),
  body: z.object({ provider, model: modelId }),
});

export const featureParamsSchema = z.object({
  params: z.object({ feature }),
});

// ── Credits ───────────────────────────────────────────────────────────────────

const pageQuery = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};

export const myCreditsSchema = z.object({
  query: z.object(pageQuery),
});

export const clearCreditHistorySchema = z.object({
  body: z.object({ dryRun: z.boolean().optional() }),
});

export const creditAccountsSchema = z.object({
  query: z.object({ ...pageQuery, search: z.string().trim().max(100).optional() }),
});

export const grantCreditsSchema = z.object({
  body: z.object({
    userId: z.string().uuid(),
    amount: z
      .number()
      .int("Use a whole number of credits")
      .min(-MAX_CREDIT_GRANT)
      .max(MAX_CREDIT_GRANT)
      .refine((n) => n !== 0, "Enter a number of credits other than 0"),
    note: z.string().trim().max(300).nullable().optional(),
  }),
});

export const creditPricesSchema = z.object({
  body: z.object({
    prices: z.record(feature, z.number().int().min(0).max(MAX_CREDIT_PRICE)),
  }),
});

export type SaveCredentialBody = z.infer<typeof saveCredentialSchema>["body"];
export type ListModelsBody = z.infer<typeof listModelsSchema>["body"];
