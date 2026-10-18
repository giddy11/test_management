// modules/ai/services/aiCredential.service.ts
// Saved AI provider keys: saving (verified with the provider first), listing,
// choosing the active one, pinning features to a model — and resolveFor, which
// decides which key a request actually runs on.
//
// Two scopes share every method (and the same routes/controller):
//   "org" — the organisation's keys, managed by holders of ai.managekeys;
//   "own" — the caller's personal keys (ai.ownkey), which win over the org's.
//
// A key is decrypted only inside this service, only to call the provider, and
// is never logged, returned or put in an error message.
import {
  AI_PROVIDER_LABELS,
  AiProviderError,
  type AiModelInfo,
  type AiProviderId,
} from "../../../infrastructure/ai/aiProvider";
import { modelTier } from "../../../infrastructure/ai/modelTiers";
import { providerFor, type AiProviderResolver } from "../../../infrastructure/ai/providers";
import { checkServerAddress, OLLAMA_CLOUD } from "../../../infrastructure/ai/serverAddress";
import { open, seal } from "../../../shared/utils/secretBox";
import type { Actor } from "../../../shared/types/actor";
import type { AiCredential } from "../entities/aiCredential.entity";
import { AiCredentialRepository, type AiKeyOwner } from "../repositories/aiCredential.repository";
import { toCredentialDTO, type AiCredentialListDTO } from "../dto/ai.dto";
import type { AiFeature } from "../domain/features";
import type { AiKeySource } from "../domain/aiErrors";
import type { ListModelsBody, SaveCredentialBody } from "../validators/ai.schema";

const { AppError } = require("../../../shared/errors/AppError");
const { can, assertPermission } = require("../../../shared/access/can");
const { ActivityService } = require("../../activity/services/activity.service");
const { env } = require("../../../config/env");

export type AiKeyScope = "org" | "own";

const SCOPE_PERMISSION: Record<AiKeyScope, string> = { org: "ai.managekeys", own: "ai.ownkey" };

// Hosted providers' keys are long; anything shorter is a typing mistake.
// Ollama keys may be any length (a self-hosted server may need none).
const MIN_HOSTED_KEY_LENGTH = 10;

export interface ResolvedCredential {
  apiKey: string;
  provider: AiProviderId;
  model: string;
  // Cheaper chat model, when set. Null when a feature pin chose the model.
  chatModel: string | null;
  baseUrl: string | null;
  source: AiKeySource;
}

export interface AiKeyStatus {
  available: boolean;
  source: AiKeySource | null;
  provider: AiProviderId | null;
  providerLabel: string | null;
  model: string | null;
  storageReady: boolean;
}

interface SecretConfig {
  configured: boolean;
  keysSecret: string;
}

export class AiCredentialService {
  static Instance = new AiCredentialService();

  constructor(
    private readonly repo: AiCredentialRepository = AiCredentialRepository.Instance,
    private readonly providers: AiProviderResolver = providerFor,
    private readonly activity = ActivityService.Instance,
    private readonly secret: SecretConfig = env.ai,
    private readonly allowPrivateServers: boolean = !env.isProduction
  ) {}

  // ── Ownership ───────────────────────────────────────────────────────────────

  private ownerFor(actor: Actor, scope: AiKeyScope): AiKeyOwner {
    assertPermission(actor, SCOPE_PERMISSION[scope]);
    if (!actor.organizationId) throw new AppError("No organisation on this account", 403);
    return { organizationId: actor.organizationId, userId: scope === "own" ? actor.id : null };
  }

  private contextOf(owner: AiKeyOwner, provider: AiProviderId): string {
    return `${owner.organizationId}:${owner.userId ?? "org"}:${provider}`;
  }

  private decrypt(owner: AiKeyOwner, row: AiCredential): string | null {
    if (!this.secret.configured || !row.keyCiphertext) return null;
    return open(row.keyCiphertext, this.secret.keysSecret, this.contextOf(owner, row.provider));
  }

  private audit(actor: Actor, scope: AiKeyScope, action: string, summary: string, row: { id?: string } | null, metadata: object) {
    return this.activity.buildEntry(actor, {
      action,
      summary: scope === "org" ? `${summary} for the organisation` : `${summary} for their own use`,
      entityType: "ai_credential",
      entityId: row?.id ?? null,
      metadata: { scope, ...metadata },
    });
  }

  // Ollama: the typed address, else the saved one, else Ollama Cloud — checked
  // against the SSRF guard every time it is about to be called or saved.
  private serverFor(provider: AiProviderId, typed: string | null | undefined, saved: string | null): string | null {
    if (provider !== "ollama") return null;
    const raw = typed?.trim() || saved || OLLAMA_CLOUD;
    const checked = checkServerAddress(raw, this.allowPrivateServers);
    if ("problem" in checked) {
      throw new AppError(checked.problem, 422, [{ field: "baseUrl", message: checked.problem }]);
    }
    return checked.url;
  }

  private checkKeyShape(provider: AiProviderId, apiKey: string): void {
    if (provider !== "ollama" && apiKey.length < MIN_HOSTED_KEY_LENGTH) {
      const message = "That doesn't look like a complete API key. Paste the whole key.";
      throw new AppError(message, 422, [{ field: "apiKey", message }]);
    }
  }

  // Calls the provider with the key. A rejected key is the user's to fix (422,
  // shown beside the field); anything else means we couldn't check it (502).
  private async verify(provider: AiProviderId, apiKey: string, baseUrl: string | null): Promise<AiModelInfo[]> {
    const label = AI_PROVIDER_LABELS[provider];
    try {
      return await this.providers(provider).listModels(apiKey, baseUrl ?? undefined);
    } catch (err) {
      const detail = err instanceof AiProviderError ? `${err.kind}: ${err.detail}` : String(err);
      console.warn(`[ai] key check failed for ${provider}: ${detail.slice(0, 600)}`);
      if (err instanceof AiProviderError && err.kind === "auth") {
        const message = `${label} did not accept this API key.`;
        throw new AppError(message, 422, [{ field: "apiKey", message }]);
      }
      throw new AppError(`${label} could not be reached to check this key. Try again in a moment.`, 502);
    }
  }

  private withTiers(provider: AiProviderId, models: AiModelInfo[]): AiModelInfo[] {
    return models.map((m) => ({ ...m, tier: modelTier(provider, m.id) }));
  }

  // ── Settings API ────────────────────────────────────────────────────────────

  async list(actor: Actor, scope: AiKeyScope): Promise<AiCredentialListDTO> {
    const owner = this.ownerFor(actor, scope);
    const rows = await this.repo.listFor(owner);
    return { storageReady: this.secret.configured, keys: rows.map(toCredentialDTO) };
  }

  // Models for a typed key (to validate before saving), or for the saved key.
  async models(actor: Actor, scope: AiKeyScope, provider: AiProviderId, body: ListModelsBody): Promise<AiModelInfo[]> {
    const owner = this.ownerFor(actor, scope);
    const saved = await this.repo.findFor(owner, provider);
    const baseUrl = this.serverFor(provider, body.baseUrl, saved?.baseUrl ?? null);
    let apiKey = body.apiKey;
    if (apiKey === undefined) {
      apiKey = saved ? this.decrypt(owner, saved) ?? undefined : undefined;
      if (apiKey === undefined) {
        const message = "Enter the API key to load its models.";
        throw new AppError(message, 422, [{ field: "apiKey", message }]);
      }
    } else {
      this.checkKeyShape(provider, apiKey);
    }
    return this.withTiers(provider, await this.verify(provider, apiKey, baseUrl));
  }

  async save(actor: Actor, scope: AiKeyScope, provider: AiProviderId, body: SaveCredentialBody) {
    const owner = this.ownerFor(actor, scope);
    if (!this.secret.configured) {
      throw new AppError(
        "AI keys can't be saved yet: the server has no AI_KEYS_SECRET set. Ask whoever runs TestMate to add it.",
        503
      );
    }
    const existing = await this.repo.findFor(owner, provider);
    const baseUrl = this.serverFor(provider, body.baseUrl, existing?.baseUrl ?? null);

    let apiKey = body.apiKey || undefined;
    if (apiKey !== undefined) {
      this.checkKeyShape(provider, apiKey);
    } else if (!existing) {
      if (provider !== "ollama") {
        const message = "Enter the API key.";
        throw new AppError(message, 422, [{ field: "apiKey", message }]);
      }
      apiKey = ""; // a self-hosted Ollama server without auth
    }

    // Verify before storing: a new key always; an unchanged key only if the
    // Ollama address it is used with has changed.
    const addressChanged = provider === "ollama" && existing !== null && existing.baseUrl !== baseUrl;
    if (apiKey !== undefined) {
      await this.verify(provider, apiKey, baseUrl);
    } else if (addressChanged && existing) {
      const current = this.decrypt(owner, existing);
      if (current === null) {
        const message = "Re-enter the API key to use it with the new address.";
        throw new AppError(message, 422, [{ field: "apiKey", message }]);
      }
      await this.verify(provider, current, baseUrl);
    }

    // The owner's first key becomes active automatically; otherwise only on request.
    const owned = await this.repo.listFor(owner);
    const makeActive = body.makeActive === true || owned.length === 0;
    const values: Partial<AiCredential> & { provider: AiProviderId } = {
      provider,
      model: body.model,
      chatModel: body.chatModel ?? null,
      baseUrl,
      updatedById: actor.id,
    };
    if (apiKey !== undefined) {
      values.keyCiphertext = seal(apiKey, this.secret.keysSecret, this.contextOf(owner, provider));
      values.keyLast4 = apiKey.slice(-4);
    }
    const saved = await this.repo.save(
      owner,
      values,
      makeActive,
      this.audit(actor, scope, "ai_key.saved", `Saved the ${AI_PROVIDER_LABELS[provider]} AI key`, existing, {
        provider,
        model: body.model,
        keyChanged: apiKey !== undefined,
      })
    );
    return toCredentialDTO(saved);
  }

  async activate(actor: Actor, scope: AiKeyScope, provider: AiProviderId): Promise<void> {
    const owner = this.ownerFor(actor, scope);
    const row = await this.repo.findFor(owner, provider);
    if (!row) throw new AppError("There is no saved key for that provider", 404);
    await this.repo.activate(
      owner,
      provider,
      this.audit(actor, scope, "ai_key.activated", `Switched AI to the ${AI_PROVIDER_LABELS[provider]} key`, row, { provider })
    );
  }

  async remove(actor: Actor, scope: AiKeyScope, provider: AiProviderId): Promise<void> {
    const owner = this.ownerFor(actor, scope);
    const row = await this.repo.findFor(owner, provider);
    if (!row) throw new AppError("There is no saved key for that provider", 404);
    await this.repo.remove(
      owner,
      provider,
      this.audit(actor, scope, "ai_key.removed", `Removed the ${AI_PROVIDER_LABELS[provider]} AI key`, row, { provider })
    );
  }

  // Pin a feature to a model on one of the owner's keys; null = back to the active key.
  async setFeatureModel(
    actor: Actor,
    scope: AiKeyScope,
    feature: AiFeature,
    target: { provider: AiProviderId; model: string } | null
  ): Promise<void> {
    const owner = this.ownerFor(actor, scope);
    if (target && !(await this.repo.findFor(owner, target.provider))) {
      const message = `Save a ${AI_PROVIDER_LABELS[target.provider]} key first.`;
      throw new AppError(message, 422, [{ field: "provider", message }]);
    }
    // What the feature ran on until now, so the log can show before → after.
    const previous = this.modelFor(await this.repo.listFor(owner), feature);
    await this.repo.setFeatureModel(
      owner,
      feature,
      target,
      this.audit(
        actor,
        scope,
        "ai_key.feature_model_set",
        target ? `Set the AI model for ${feature}` : `Reset the AI model for ${feature}`,
        null,
        { feature, provider: target?.provider ?? null, model: target?.model ?? null, previous }
      )
    );
  }

  // The model a feature runs on for one owner: its pin, else the active key's.
  private modelFor(rows: AiCredential[], feature: AiFeature): { provider: AiProviderId; model: string; pinned: boolean } | null {
    const pinned = rows.find((r) => r.featureModels?.[feature]);
    if (pinned) return { provider: pinned.provider, model: pinned.featureModels[feature], pinned: true };
    const active = rows.find((r) => r.isActive);
    return active ? { provider: active.provider, model: active.model, pinned: false } : null;
  }

  // ── Resolution ──────────────────────────────────────────────────────────────

  // Which key a request runs on. For each owner in order — the caller's own
  // keys (if they may use them), then the organisation's — take the key with
  // this feature pinned, else that owner's active key. A key that won't decrypt
  // (secret rotated) is skipped, so the next candidate is tried.
  async resolveFor(actor: Actor, feature?: AiFeature): Promise<ResolvedCredential | null> {
    if (!this.secret.configured || !actor.organizationId) return null;
    const owners: { owner: AiKeyOwner; source: AiKeySource }[] = [];
    if (can(actor, "ai.ownkey")) {
      owners.push({ owner: { organizationId: actor.organizationId, userId: actor.id }, source: "user" });
    }
    owners.push({ owner: { organizationId: actor.organizationId, userId: null }, source: "organization" });

    for (const { owner, source } of owners) {
      const rows = await this.repo.listFor(owner);
      const pinned = feature ? rows.find((r) => r.featureModels?.[feature]) : undefined;
      const active = rows.find((r) => r.isActive);
      for (const row of [pinned, active]) {
        if (!row) continue;
        const apiKey = this.decrypt(owner, row);
        if (apiKey === null) {
          console.warn(`[ai] skipped an unreadable ${row.provider} key (${source}) — was AI_KEYS_SECRET changed?`);
          continue;
        }
        const featureModel = row === pinned && feature ? row.featureModels[feature] : null;
        return {
          apiKey,
          provider: row.provider,
          // A feature pin is the whole choice: the separate chat model doesn't apply.
          model: featureModel ?? row.model,
          chatModel: featureModel ? null : row.chatModel,
          baseUrl: row.baseUrl,
          source,
        };
      }
    }
    return null;
  }

  async statusFor(actor: Actor, feature?: AiFeature): Promise<AiKeyStatus> {
    const resolved = await this.resolveFor(actor, feature);
    return {
      available: resolved !== null,
      source: resolved?.source ?? null,
      provider: resolved?.provider ?? null,
      providerLabel: resolved ? AI_PROVIDER_LABELS[resolved.provider] : null,
      model: resolved?.model ?? null,
      storageReady: this.secret.configured,
    };
  }
}
