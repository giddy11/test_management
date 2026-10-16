// modules/ai/tests/aiCredential.service.spec.ts
// AiCredentialService against an in-memory repository and a fake provider:
// verify-before-save, sealed storage, the storage-not-ready refusal, the
// Ollama address guard, and resolveFor's order (own → organisation; feature
// pin → active key; unreadable keys skipped).
import { AiProviderError, type AiProvider, type AiProviderId } from "../../../infrastructure/ai/aiProvider";
import { open, seal } from "../../../shared/utils/secretBox";
import { AiCredentialService } from "../services/aiCredential.service";
import type { AiCredential } from "../entities/aiCredential.entity";
import type { AiKeyOwner } from "../repositories/aiCredential.repository";

const { actorFor } = require("../../../test/actors");

const SECRET = { configured: true, keysSecret: "a-test-secret-that-is-at-least-32-characters" };
const admin = actorFor("admin", { id: "admin-1", organizationId: "org-1" });
const user = actorFor("user", { id: "user-1", organizationId: "org-1" });

const ownerKey = (o: AiKeyOwner) => `${o.organizationId}:${o.userId ?? "org"}`;

// Minimal in-memory stand-in for AiCredentialRepository.
function memoryRepo() {
  const rows: AiCredential[] = [];
  const of = (o: AiKeyOwner) => rows.filter((r) => ownerKey({ organizationId: r.organizationId, userId: r.userId }) === ownerKey(o));
  return {
    rows,
    audits: [] as unknown[],
    async listFor(o: AiKeyOwner) {
      return of(o);
    },
    async findFor(o: AiKeyOwner, provider: AiProviderId) {
      return of(o).find((r) => r.provider === provider) ?? null;
    },
    async save(o: AiKeyOwner, values: Partial<AiCredential> & { provider: AiProviderId }, makeActive: boolean, audit: unknown) {
      this.audits.push(audit);
      if (makeActive) of(o).forEach((r) => (r.isActive = false));
      let row = of(o).find((r) => r.provider === values.provider);
      if (row) Object.assign(row, values, makeActive ? { isActive: true } : {});
      else {
        row = {
          id: `cred-${rows.length + 1}`,
          organizationId: o.organizationId,
          userId: o.userId,
          featureModels: {},
          chatModel: null,
          baseUrl: null,
          keyCiphertext: "",
          keyLast4: "",
          updatedById: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
          ...values,
          isActive: makeActive,
        } as AiCredential;
        rows.push(row);
      }
      return row;
    },
    async activate(o: AiKeyOwner, provider: AiProviderId) {
      of(o).forEach((r) => (r.isActive = r.provider === provider));
    },
    async remove() {},
    async setFeatureModel(o: AiKeyOwner, feature: string, target: { provider: AiProviderId; model: string } | null) {
      for (const r of of(o)) {
        if (target && r.provider === target.provider) r.featureModels = { ...r.featureModels, [feature]: target.model };
        else {
          const next = { ...r.featureModels };
          delete next[feature];
          r.featureModels = next;
        }
      }
    },
  };
}

function setup(opts: { secret?: typeof SECRET; allowPrivate?: boolean } = {}) {
  const repo = memoryRepo();
  const provider = {
    id: "anthropic",
    generate: jest.fn(),
    stream: jest.fn(),
    listModels: jest.fn().mockResolvedValue([{ id: "claude-opus-5-5", label: "Claude Opus 5.5" }]),
  } as unknown as jest.Mocked<AiProvider>;
  const activity = { buildEntry: jest.fn((_actor: unknown, o: object) => ({ ...o })) };
  const service = new AiCredentialService(repo as any, () => provider, activity, opts.secret ?? SECRET, opts.allowPrivate ?? false);
  return { service, repo, provider, activity };
}

// Seeds a stored key directly, sealed with the context the service uses.
function storeKey(repo: ReturnType<typeof memoryRepo>, o: AiKeyOwner, provider: AiProviderId, apiKey: string, extra: Partial<AiCredential> = {}) {
  const context = `${o.organizationId}:${o.userId ?? "org"}:${provider}`;
  return repo.save(o, { provider, model: `${provider}-model`, keyCiphertext: seal(apiKey, SECRET.keysSecret, context), keyLast4: apiKey.slice(-4), ...extra }, !!extra.isActive, {});
}

const ORG: AiKeyOwner = { organizationId: "org-1", userId: null };
const OWN: AiKeyOwner = { organizationId: "org-1", userId: "user-1" };

describe("AiCredentialService.save", () => {
  beforeEach(() => jest.spyOn(console, "warn").mockImplementation(() => undefined));

  it("refuses with 503 when there is no AI_KEYS_SECRET", async () => {
    const { service, provider } = setup({ secret: { configured: false, keysSecret: "" } });
    await expect(service.save(admin, "org", "anthropic", { apiKey: "sk-ant-1234567890", model: "m" })).rejects.toMatchObject({ statusCode: 503 });
    expect(provider.listModels).not.toHaveBeenCalled();
  });

  it("verifies the key with the provider, then stores it sealed with only the last 4 readable", async () => {
    const { service, repo, provider, activity } = setup();
    const dto = await service.save(admin, "org", "anthropic", { apiKey: "sk-ant-1234567890abcd", model: "claude-opus-5-5" });

    expect(provider.listModels).toHaveBeenCalledWith("sk-ant-1234567890abcd", undefined);
    const row = repo.rows[0];
    expect(row.keyCiphertext).not.toContain("sk-ant");
    expect(open(row.keyCiphertext, SECRET.keysSecret, "org-1:org:anthropic")).toBe("sk-ant-1234567890abcd");
    expect(dto).toMatchObject({ provider: "anthropic", keyLast4: "abcd", isActive: true });
    expect(JSON.stringify(dto)).not.toContain("sk-ant");
    expect(dto).not.toHaveProperty("keyCiphertext");
    // The audit entry names the change, never the key.
    expect(JSON.stringify(activity.buildEntry.mock.calls)).not.toContain("sk-ant");
  });

  it("rejects a key the provider doesn't accept, beside the field, without storing it", async () => {
    const { service, repo, provider } = setup();
    provider.listModels.mockRejectedValue(new AiProviderError("auth", "invalid x-api-key", 401));
    const err = await service.save(admin, "org", "anthropic", { apiKey: "sk-ant-wrong-key-000", model: "m" }).catch((e) => e);
    expect(err).toMatchObject({ statusCode: 422, message: "Anthropic did not accept this API key." });
    expect(err.errors[0].field).toBe("apiKey");
    expect(repo.rows).toHaveLength(0);
  });

  it("reports an unreachable provider as 502", async () => {
    const { service, provider } = setup();
    provider.listModels.mockRejectedValue(new AiProviderError("unavailable", "ECONNRESET"));
    await expect(service.save(admin, "org", "anthropic", { apiKey: "sk-ant-1234567890", model: "m" })).rejects.toMatchObject({ statusCode: 502 });
  });

  it("rejects an obviously truncated hosted key before calling the provider", async () => {
    const { service, provider } = setup();
    await expect(service.save(admin, "org", "openai", { apiKey: "sk-123", model: "gpt-5" })).rejects.toMatchObject({ statusCode: 422 });
    expect(provider.listModels).not.toHaveBeenCalled();
  });

  it("lets the model change without retyping or re-checking the key", async () => {
    const { service, repo, provider } = setup();
    await service.save(admin, "org", "anthropic", { apiKey: "sk-ant-1234567890abcd", model: "a" });
    const sealed = repo.rows[0].keyCiphertext;
    provider.listModels.mockClear();

    await service.save(admin, "org", "anthropic", { model: "b" });

    expect(provider.listModels).not.toHaveBeenCalled();
    expect(repo.rows[0]).toMatchObject({ model: "b", keyCiphertext: sealed });
  });

  it("makes only the first key active unless asked", async () => {
    const { service, repo } = setup();
    await service.save(admin, "org", "anthropic", { apiKey: "sk-ant-1234567890", model: "a" });
    await service.save(admin, "org", "openai", { apiKey: "sk-proj-1234567890", model: "gpt-5" });
    expect(repo.rows.map((r) => [r.provider, r.isActive])).toEqual([["anthropic", true], ["openai", false]]);
    await service.save(admin, "org", "openai", { model: "gpt-5", makeActive: true });
    expect(repo.rows.map((r) => [r.provider, r.isActive])).toEqual([["anthropic", false], ["openai", true]]);
  });

  it("blocks a private Ollama address in production", async () => {
    const { service, provider } = setup({ allowPrivate: false });
    const err = await service.save(admin, "org", "ollama", { apiKey: "", model: "llama3.3", baseUrl: "http://10.0.0.5:11434" }).catch((e) => e);
    expect(err).toMatchObject({ statusCode: 422 });
    expect(err.errors[0].field).toBe("baseUrl");
    expect(provider.listModels).not.toHaveBeenCalled();
  });

  it("defaults Ollama to Ollama Cloud", async () => {
    const { service, provider } = setup();
    await service.save(admin, "org", "ollama", { apiKey: "ollama-token", model: "gpt-oss:120b" });
    expect(provider.listModels).toHaveBeenCalledWith("ollama-token", "https://ollama.com");
  });
});

describe("AiCredentialService — permissions and feature pins", () => {
  it("keeps the organisation's keys to holders of ai.managekeys", async () => {
    const { service } = setup();
    await expect(service.list(user, "org")).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.list(user, "own")).resolves.toMatchObject({ storageReady: true, keys: [] });
  });

  it("only pins a feature to a provider the owner has a key for", async () => {
    const { service } = setup();
    await expect(service.setFeatureModel(admin, "org", "test_case_draft", { provider: "gemini", model: "gemini-2.5-pro" })).rejects.toMatchObject({ statusCode: 422 });
  });
});

describe("AiCredentialService.resolveFor", () => {
  beforeEach(() => jest.spyOn(console, "warn").mockImplementation(() => undefined));

  it("returns null when nothing is set up", async () => {
    const { service } = setup();
    expect(await service.resolveFor(user)).toBeNull();
  });

  it("falls back to the organisation's active key", async () => {
    const { service, repo } = setup();
    await storeKey(repo, ORG, "anthropic", "sk-org-key-1111", { isActive: true });
    expect(await service.resolveFor(user)).toMatchObject({ apiKey: "sk-org-key-1111", provider: "anthropic", source: "organization" });
  });

  it("prefers the user's own key", async () => {
    const { service, repo } = setup();
    await storeKey(repo, ORG, "anthropic", "sk-org-key-1111", { isActive: true });
    await storeKey(repo, OWN, "openai", "sk-own-key-2222", { isActive: true });
    expect(await service.resolveFor(user)).toMatchObject({ apiKey: "sk-own-key-2222", provider: "openai", source: "user" });
  });

  it("ignores a user's own key when they may no longer use one", async () => {
    const { service, repo } = setup();
    await storeKey(repo, ORG, "anthropic", "sk-org-key-1111", { isActive: true });
    await storeKey(repo, OWN, "openai", "sk-own-key-2222", { isActive: true });
    const restricted = { ...user, permissions: new Set([...user.permissions].filter((p: string) => p !== "ai.ownkey")) };
    expect(await service.resolveFor(restricted)).toMatchObject({ source: "organization" });
  });

  it("uses a feature's pinned model over the active key, without the chat model", async () => {
    const { service, repo } = setup();
    await storeKey(repo, ORG, "anthropic", "sk-org-key-1111", { isActive: true, chatModel: "claude-haiku-5-5" });
    await storeKey(repo, ORG, "gemini", "gm-org-key-3333", { featureModels: { bug_report_draft: "gemini-2.5-pro" } });

    expect(await service.resolveFor(user, "bug_report_draft")).toMatchObject({
      provider: "gemini",
      model: "gemini-2.5-pro",
      chatModel: null,
    });
    // Other features stay on the active key, chat model included.
    expect(await service.resolveFor(user, "test_case_draft")).toMatchObject({
      provider: "anthropic",
      chatModel: "claude-haiku-5-5",
    });
  });

  it("skips a key that no longer decrypts and tries the next owner", async () => {
    const { service, repo } = setup();
    await storeKey(repo, ORG, "anthropic", "sk-org-key-1111", { isActive: true });
    const own = await storeKey(repo, OWN, "openai", "sk-own-key-2222", { isActive: true });
    own.keyCiphertext = seal("sk-own-key-2222", "a-different-secret-from-before-the-rotation", "org-1:user-1:openai");
    expect(await service.resolveFor(user)).toMatchObject({ source: "organization", apiKey: "sk-org-key-1111" });
  });

  it("is off entirely without AI_KEYS_SECRET", async () => {
    const { service, repo } = setup({ secret: { configured: false, keysSecret: "" } });
    await storeKey(repo, ORG, "anthropic", "sk-org-key-1111", { isActive: true });
    expect(await service.resolveFor(user)).toBeNull();
  });
});
