// modules/ai/services/ai.service.ts
// THE entry point for AI. Feature services (test-case draft, bug-report draft…)
// call generateJson / streamText here and nothing else: they never see a
// vendor SDK, a key, or a provider error.
//
// Every request goes through attempt():
//   1. resolve the key (feature pin → active key; own → organisation),
//   2. charge credits up front — only on the organisation's key, and only for a
//      feature the organisation has priced (AiCreditService),
//   3. call the provider,
//   4. log usage (counts only) — bookkeeping never fails the request,
//   5. on ANY failure: refund, log the error, and throw a message the user can
//      act on. A request that produced nothing usable costs nobody credits.
import type { z } from "zod";
import {
  AiProviderError,
  type AiChatMessage,
  type AiGenerateResult,
  type AiImage,
  type AiProvider,
  type AiProviderId,
} from "../../../infrastructure/ai/aiProvider";
import { providerFor, type AiProviderResolver } from "../../../infrastructure/ai/providers";
import type { Actor } from "../../../shared/types/actor";
import { AiCredentialService, type ResolvedCredential } from "./aiCredential.service";
import { AiUsageRepository } from "../repositories/aiUsage.repository";
import type { AiFeature } from "../domain/features";
import {
  AiRequestError,
  noKeyError,
  toRequestError,
  unexpectedFormatMessage,
  UnusableReply,
  type AiKeySource,
} from "../domain/aiErrors";
import { describeRejection } from "../domain/lenient";
import { parseJson } from "../domain/parseJson";
import type { AiStatusDTO } from "../dto/ai.dto";
import type { AiCreditCharger } from "../domain/credits";
import { AiCreditService } from "./aiCredit.service";

const { env } = require("../../../config/env");

export { NO_CREDITS, type AiCharge, type AiCreditCharger } from "../domain/credits";

// ── Requests ──────────────────────────────────────────────────────────────────

export interface GenerateJsonRequest<T> {
  feature: AiFeature;
  projectId?: string | null;
  system: string;
  prompt: string;
  images?: AiImage[];
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  maxOutputTokens?: number;
  timeoutMs?: number;
  // Feature-specific wording for a reply that failed validation, matched
  // against the validation problem (e.g. a missing steps list).
  rejectionHints?: { includes: string; message: string }[];
}

export interface GenerateJsonResult<T> {
  data: T;
  imagesIgnored: boolean;
  provider: AiProviderId;
  model: string;
  source: AiKeySource;
  creditsCharged: number;
}

export interface StreamTextRequest {
  feature: AiFeature;
  projectId?: string | null;
  system: string;
  messages: AiChatMessage[];
  maxOutputTokens?: number;
  timeoutMs?: number;
}

export interface StreamTextResult {
  text: string;
  provider: AiProviderId;
  model: string;
  source: AiKeySource;
  creditsCharged: number;
}

interface AttemptOptions {
  feature: AiFeature;
  projectId?: string | null;
  isChat: boolean;
}

type ProviderCall<R> = (
  provider: AiProvider,
  apiKey: string,
  model: string,
  server: { baseUrl?: string }
) => Promise<{ value: R; usage: AiGenerateResult }>;

const DEFAULT_JSON_TOKENS = 16_000;
const DEFAULT_CHAT_TOKENS = 8_000;

export class AiService {
  static Instance = new AiService();

  constructor(
    private readonly credentials: AiCredentialService = AiCredentialService.Instance,
    private readonly usage: AiUsageRepository = AiUsageRepository.Instance,
    private readonly providers: AiProviderResolver = providerFor,
    private readonly credits: AiCreditCharger = AiCreditService.Instance
  ) {}

  async status(actor: Actor, feature?: AiFeature): Promise<AiStatusDTO> {
    const key = await this.credentials.statusFor(actor, feature);
    const credits = key.source === "organization" ? await this.credits.statusFor(actor, feature) : null;
    return { ...key, credits };
  }

  async generateJson<T>(actor: Actor, req: GenerateJsonRequest<T>): Promise<GenerateJsonResult<T>> {
    let imagesIgnored = false;

    const outcome = await this.attempt<T>(actor, { feature: req.feature, projectId: req.projectId, isChat: false }, async (provider, apiKey, model, server) => {
      let images = req.images ?? [];
      const send = (prompt: string, pictures: AiImage[]) =>
        provider.generate(apiKey, {
          model,
          ...server,
          system: req.system,
          prompt,
          images: pictures,
          schemaName: req.schemaName,
          jsonSchema: req.jsonSchema,
          maxOutputTokens: req.maxOutputTokens ?? DEFAULT_JSON_TOKENS,
          timeoutMs: req.timeoutMs,
        });

      // A model that can't see: retry the SAME request without the images,
      // and say so (imagesIgnored) so the UI can tell the person.
      const ask = async (prompt: string) => {
        try {
          return await send(prompt, images);
        } catch (err) {
          const visionProblem =
            err instanceof AiProviderError &&
            (err.kind === "invalid_request" || /image|vision|multimodal|modalit/i.test(err.detail));
          if (!images.length || !visionProblem) throw err;
          images = [];
          imagesIgnored = true;
          return send(prompt, []);
        }
      };

      const check = (reply: AiGenerateResult) => {
        const json = parseJson(reply.text);
        const parsed = req.schema.safeParse(json);
        return parsed.success
          ? ({ ok: true, data: parsed.data } as const)
          : ({ ok: false, problem: describeRejection(json, json === undefined ? null : parsed.error) } as const);
      };

      let result = await ask(req.prompt);
      let checked = check(result);
      if (!checked.ok) {
        // ONE retry, telling the model what was wrong. Both replies are billed.
        const again = await ask(
          `${req.prompt}\n\nYour previous reply could not be used because ${checked.problem}. ` +
            `Reply again with only the JSON object, with every field present.`
        );
        result = {
          text: again.text,
          inputTokens: result.inputTokens + again.inputTokens,
          outputTokens: result.outputTokens + again.outputTokens,
        };
        checked = check(result);
      }
      if (!checked.ok) {
        if (!env.isProduction) {
          console.warn(`[ai] rejected reply (${req.feature}): ${checked.problem} — ${result.text.slice(0, 300)}`);
        }
        const hint = req.rejectionHints?.find((h) => checked.problem.includes(h.includes));
        throw new UnusableReply(
          result,
          "invalid_output",
          new AiRequestError(hint?.message ?? unexpectedFormatMessage(model), 502, "bad_output")
        );
      }
      return { value: checked.data, usage: result };
    });

    return { data: outcome.value, imagesIgnored, ...outcome.meta };
  }

  async streamText(actor: Actor, req: StreamTextRequest, onText: (delta: string) => void): Promise<StreamTextResult> {
    const outcome = await this.attempt<string>(actor, { feature: req.feature, projectId: req.projectId, isChat: true }, async (provider, apiKey, model, server) => {
      const usage = await provider.stream(
        apiKey,
        {
          model,
          ...server,
          system: req.system,
          messages: req.messages,
          maxOutputTokens: req.maxOutputTokens ?? DEFAULT_CHAT_TOKENS,
          timeoutMs: req.timeoutMs,
        },
        onText
      );
      return { value: usage.text, usage };
    });
    return { text: outcome.value, ...outcome.meta };
  }

  // ── The shared request lifecycle ────────────────────────────────────────────

  private async attempt<R>(actor: Actor, opts: AttemptOptions, call: ProviderCall<R>) {
    const credential: ResolvedCredential | null = await this.credentials.resolveFor(actor, opts.feature);
    if (!credential || !actor.organizationId) throw noKeyError();

    const model = (opts.isChat && credential.chatModel) || credential.model;
    const ctx = { provider: credential.provider, model, source: credential.source };

    // Credits are spent only on the organisation's key; a user's own key is never charged.
    const charge =
      credential.source === "organization"
        ? await this.credits.charge(actor, opts.feature, { projectId: opts.projectId ?? null })
        : null;

    const started = Date.now();
    const record = (status: "ok" | "error", usage: AiGenerateResult | null, errorKind: string | null) =>
      this.usage
        .create({
          organizationId: actor.organizationId as string,
          userId: actor.id,
          keySource: credential.source,
          provider: credential.provider,
          model,
          feature: opts.feature,
          projectId: opts.projectId ?? null,
          inputTokens: usage?.inputTokens ?? 0,
          outputTokens: usage?.outputTokens ?? 0,
          status,
          errorKind,
          durationMs: Date.now() - started,
        })
        // Bookkeeping must never fail the request it describes.
        .catch((e: unknown) => console.error("[ai] usage log failed:", e instanceof Error ? e.message : e));

    try {
      const { value, usage } = await call(
        this.providers(credential.provider),
        credential.apiKey,
        model,
        credential.baseUrl ? { baseUrl: credential.baseUrl } : {}
      );
      await record("ok", usage, null);
      return { value, meta: { ...ctx, creditsCharged: charge?.amount ?? 0 } };
    } catch (err) {
      if (charge) {
        await charge.refund().catch((e: unknown) => console.error("[ai] credit refund failed:", e instanceof Error ? e.message : e));
      }
      const errorKind =
        err instanceof UnusableReply ? err.errorKind : err instanceof AiProviderError ? err.kind : "unknown";
      await record("error", err instanceof UnusableReply ? err.result : null, errorKind);

      const mapped = toRequestError(err, ctx);
      console.warn(
        `[ai] ${opts.feature} failed (${mapped.reason}) user=${actor.id} org=${actor.organizationId} ` +
          `provider=${credential.provider} model=${model} source=${credential.source}` +
          (mapped.provider ? ` status=${mapped.provider.status ?? "-"} detail=${mapped.provider.message}` : "")
      );
      throw mapped;
    }
  }
}
