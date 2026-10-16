// modules/ai/tests/ai.service.spec.ts
// AiService with everything faked: provider (via the resolver), credentials,
// usage log and credits. Covers charging only on the organisation's key,
// refunds on every failure path, the one validation retry, the no-vision
// retry, and the provider-error → user-message mapping.
import { z } from "zod";
import { AiProviderError, type AiErrorKind, type AiProvider } from "../../../infrastructure/ai/aiProvider";
import { AiService, type AiCreditCharger } from "../services/ai.service";
import { AiRequestError } from "../domain/aiErrors";
import type { ResolvedCredential } from "../services/aiCredential.service";

const { actorFor } = require("../../../test/actors");

const actor = actorFor("user", { id: "user-1", organizationId: "org-1" });

const schema = z.object({ title: z.string(), steps: z.array(z.string()) });
const jsonSchema = { type: "object" };
const GOOD = JSON.stringify({ title: "Login works", steps: ["Open", "Sign in"] });

function credential(overrides: Partial<ResolvedCredential> = {}): ResolvedCredential {
  return {
    apiKey: "sk-test-key-123456",
    provider: "anthropic",
    model: "claude-opus-5-5",
    chatModel: null,
    baseUrl: null,
    source: "organization",
    ...overrides,
  };
}

function setup(cred: ResolvedCredential | null = credential()) {
  const provider = {
    id: "anthropic",
    generate: jest.fn(),
    stream: jest.fn(),
    listModels: jest.fn(),
  } as unknown as jest.Mocked<AiProvider>;
  const credentials = {
    resolveFor: jest.fn().mockResolvedValue(cred),
    statusFor: jest.fn(),
  };
  const usage = { create: jest.fn().mockResolvedValue(undefined) };
  const refund = jest.fn().mockResolvedValue(undefined);
  const credits: jest.Mocked<AiCreditCharger> = {
    charge: jest.fn().mockResolvedValue({ amount: 2, refund }),
    statusFor: jest.fn().mockResolvedValue(null),
  };
  const service = new AiService(credentials as any, usage as any, () => provider, credits);
  return { service, provider, credentials, usage, credits, refund };
}

const request = (extra: object = {}) => ({
  feature: "test_case_draft" as const,
  projectId: "project-1",
  system: "You draft test cases.",
  prompt: "Draft a login test.",
  schema,
  schemaName: "test_case_draft",
  jsonSchema,
  ...extra,
});

const reply = (text: string, inputTokens = 10, outputTokens = 5) => ({ text, inputTokens, outputTokens });

describe("AiService.generateJson — happy path and billing", () => {
  it("returns the validated draft and logs usage with counts only", async () => {
    const { service, provider, usage } = setup();
    provider.generate.mockResolvedValue(reply(GOOD, 100, 40));

    const result = await service.generateJson(actor, request());

    expect(result).toMatchObject({
      data: { title: "Login works", steps: ["Open", "Sign in"] },
      imagesIgnored: false,
      provider: "anthropic",
      model: "claude-opus-5-5",
      source: "organization",
      creditsCharged: 2,
    });
    expect(provider.generate).toHaveBeenCalledWith(
      "sk-test-key-123456",
      expect.objectContaining({ model: "claude-opus-5-5", maxOutputTokens: 16000, schemaName: "test_case_draft" })
    );
    const row = usage.create.mock.calls[0][0];
    expect(row).toMatchObject({
      organizationId: "org-1",
      userId: "user-1",
      keySource: "organization",
      feature: "test_case_draft",
      projectId: "project-1",
      inputTokens: 100,
      outputTokens: 40,
      status: "ok",
      errorKind: null,
    });
    expect(JSON.stringify(row)).not.toContain("Login works");
    expect(JSON.stringify(row)).not.toContain("Draft a login test");
  });

  it("charges credits on the organisation's key", async () => {
    const { service, provider, credits } = setup(credential({ source: "organization" }));
    provider.generate.mockResolvedValue(reply(GOOD));
    await service.generateJson(actor, request());
    expect(credits.charge).toHaveBeenCalledWith(actor, "test_case_draft", { projectId: "project-1" });
  });

  it("never charges a user's own key", async () => {
    const { service, provider, credits } = setup(credential({ source: "user" }));
    provider.generate.mockResolvedValue(reply(GOOD));
    const result = await service.generateJson(actor, request());
    expect(credits.charge).not.toHaveBeenCalled();
    expect(result.creditsCharged).toBe(0);
  });

  it("still succeeds when the usage log write fails", async () => {
    const { service, provider, usage } = setup();
    provider.generate.mockResolvedValue(reply(GOOD));
    usage.create.mockRejectedValue(new Error("db down"));
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(service.generateJson(actor, request())).resolves.toBeDefined();
  });
});

describe("AiService.generateJson — no key", () => {
  it("fails with no_key before charging anything", async () => {
    const { service, credits, provider } = setup(null);
    const err = await service.generateJson(actor, request()).catch((e) => e);
    expect(err).toBeInstanceOf(AiRequestError);
    expect(err).toMatchObject({ statusCode: 503, reason: "no_key", data: { reason: "no_key" } });
    expect(credits.charge).not.toHaveBeenCalled();
    expect(provider.generate).not.toHaveBeenCalled();
  });
});

describe("AiService.generateJson — unusable replies", () => {
  beforeEach(() => jest.spyOn(console, "warn").mockImplementation(() => undefined));

  it("retries once with feedback and bills both replies", async () => {
    const { service, provider, usage } = setup();
    provider.generate.mockResolvedValueOnce(reply('{"title":"x"}', 10, 5)).mockResolvedValueOnce(reply(GOOD, 12, 6));

    const result = await service.generateJson(actor, request());

    expect(result.data.title).toBe("Login works");
    expect(provider.generate).toHaveBeenCalledTimes(2);
    const retryPrompt = provider.generate.mock.calls[1][1].prompt;
    expect(retryPrompt).toContain("Your previous reply could not be used because");
    expect(retryPrompt).toContain("steps");
    expect(usage.create.mock.calls[0][0]).toMatchObject({ inputTokens: 22, outputTokens: 11, status: "ok" });
  });

  it("fails with bad_output after two unusable replies, refunds, and logs the tokens", async () => {
    const { service, provider, usage, refund } = setup();
    provider.generate.mockResolvedValue(reply("not json at all", 10, 5));

    const err = await service.generateJson(actor, request()).catch((e) => e);

    expect(err).toMatchObject({ statusCode: 502, reason: "bad_output" });
    expect(err.message).toContain("unexpected format");
    expect(refund).toHaveBeenCalledTimes(1);
    expect(usage.create.mock.calls[0][0]).toMatchObject({
      status: "error",
      errorKind: "invalid_output",
      inputTokens: 20,
      outputTokens: 10,
    });
  });

  it("uses a feature's rejection hint when it matches the problem", async () => {
    const { service, provider } = setup();
    provider.generate.mockResolvedValue(reply('{"title":"x"}'));
    const err = await service
      .generateJson(actor, request({ rejectionHints: [{ includes: "steps", message: "The AI didn't write any steps." }] }))
      .catch((e) => e);
    expect(err.message).toBe("The AI didn't write any steps.");
  });
});

describe("AiService.generateJson — images", () => {
  const images = [{ mimeType: "image/png" as const, data: "aGVsbG8=" }];

  it("retries without images when the model can't see, and says so", async () => {
    const { service, provider } = setup();
    provider.generate
      .mockRejectedValueOnce(new AiProviderError("invalid_request", "this model does not support image input", 400))
      .mockResolvedValueOnce(reply(GOOD));

    const result = await service.generateJson(actor, request({ images }));

    expect(result.imagesIgnored).toBe(true);
    expect(provider.generate.mock.calls[0][1].images).toHaveLength(1);
    expect(provider.generate.mock.calls[1][1].images).toEqual([]);
  });

  it("doesn't treat an unrelated failure as a vision problem", async () => {
    const { service, provider } = setup();
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    provider.generate.mockRejectedValue(new AiProviderError("unavailable", "socket hang up"));
    await expect(service.generateJson(actor, request({ images }))).rejects.toMatchObject({ reason: "unreachable" });
    expect(provider.generate).toHaveBeenCalledTimes(1);
  });
});

describe("AiService — provider failures become actionable messages", () => {
  beforeEach(() => jest.spyOn(console, "warn").mockImplementation(() => undefined));

  it.each<[AiErrorKind, number, string, string]>([
    ["auth", 502, "key_rejected", "Anthropic rejected your organisation's API key"],
    ["account", 502, "provider_account", "the model \"claude-opus-5-5\" may need a subscription"],
    ["rate_limit", 503, "busy", "Try again in a minute"],
    ["invalid_request", 502, "model_rejected", "Choose another model in the AI settings"],
    ["refused", 422, "refused", "declined to respond"],
    ["truncated", 502, "bad_output", "cut off"],
    ["unavailable", 502, "unreachable", "did not respond"],
  ])("%s → %d %s", async (kind, status, reason, text) => {
    const { service, provider, refund, usage } = setup();
    provider.generate.mockRejectedValue(new AiProviderError(kind, "raw vendor detail sk-secret", 400));

    const err = await service.generateJson(actor, request()).catch((e) => e);

    expect(err).toMatchObject({ statusCode: status, reason });
    expect(err.message).toContain(text);
    // The vendor's own words stay in the logs.
    expect(err.message).not.toContain("raw vendor detail");
    expect(refund).toHaveBeenCalledTimes(1);
    expect(usage.create.mock.calls[0][0]).toMatchObject({ status: "error", errorKind: kind });
  });

  it("says 'your' when it was the caller's own key", async () => {
    const { service, provider } = setup(credential({ source: "user" }));
    provider.generate.mockRejectedValue(new AiProviderError("auth", "bad key", 401));
    await expect(service.generateJson(actor, request())).rejects.toThrow("Anthropic rejected your API key");
  });

  it("still throws the mapped error when the refund itself fails", async () => {
    const { service, provider, refund } = setup();
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    refund.mockRejectedValue(new Error("db down"));
    provider.generate.mockRejectedValue(new AiProviderError("rate_limit", "429"));
    await expect(service.generateJson(actor, request())).rejects.toMatchObject({ reason: "busy" });
  });
});

describe("AiService.streamText", () => {
  it("streams deltas and uses the cheaper chat model when one is set", async () => {
    const { service, provider } = setup(credential({ chatModel: "claude-haiku-5-5", source: "user" }));
    provider.stream.mockImplementation(async (_key, _req, onText) => {
      onText("Hel");
      onText("lo");
      return reply("Hello", 8, 2);
    });
    const deltas: string[] = [];

    const result = await service.streamText(
      actor,
      { feature: "test_case_draft", system: "s", messages: [{ role: "user", content: "hi" }] },
      (d) => deltas.push(d)
    );

    expect(deltas).toEqual(["Hel", "lo"]);
    expect(result).toMatchObject({ text: "Hello", model: "claude-haiku-5-5", source: "user", creditsCharged: 0 });
    expect(provider.stream.mock.calls[0][1]).toMatchObject({ model: "claude-haiku-5-5", maxOutputTokens: 8000 });
  });
});
