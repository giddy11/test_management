// shared/utils/mail/tests/emailSender.spec.ts
//
// The one send wrapper and what it writes to the email log. Transports are
// faked (nothing touches the network) and so is the log's repository, but the
// wrapper, the chain executor, the log service and the row builder are all real,
// so what the repository receives is exactly the row that would be inserted.
import { EmailSendError, type EmailProviderCode, type EmailSendResult } from "../emailProviders";
import type { EmailTransport } from "../emailTransports";

jest.mock("../../../../modules/emailLog/repositories/emailLog.repository", () => ({
  EmailLogRepository: {
    Instance: { insertMany: jest.fn(), list: jest.fn(), summary: jest.fn(), purgeOlderThan: jest.fn() },
  },
}));
jest.mock("../emailTransports", () => ({
  ...jest.requireActual("../emailTransports"),
  transportChain: jest.fn(),
}));

const { sendEmail, isReservedTestAddress } = require("../emailSender");
const { transportChain } = require("../emailTransports");
const { EmailLogRepository } = require("../../../../modules/emailLog/repositories/emailLog.repository");

const insertMany: jest.Mock = EmailLogRepository.Instance.insertMany;
const chainMock: jest.Mock = transportChain;

// The record call is not awaited by the sender, so let it land before asserting.
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

// Every row handed to the log so far, flattened.
const rows = (): any[] => insertMany.mock.calls.flatMap(([batch]) => batch);

function transport(
  provider: EmailProviderCode,
  outcome: { ok: Partial<EmailSendResult> } | { fail: string } | { configured: false }
): EmailTransport & { send: jest.Mock } {
  const configured = !("configured" in outcome);
  return {
    provider,
    isConfigured: () => configured,
    notConfiguredReason: `${provider} is not configured`,
    send: jest.fn(async () => {
      if ("fail" in outcome) {
        throw new EmailSendError(outcome.fail, { provider, fallback: false, note: outcome.fail });
      }
      if ("ok" in outcome) return { provider, fallback: false, ...outcome.ok };
      throw new Error("unreachable");
    }),
  };
}

const mail = (overrides: Record<string, unknown> = {}) => ({
  to: "person@company.com",
  subject: "Run completed — Smoke — ServiceDesk4u",
  html: "<p>SECRET BODY</p>",
  text: "SECRET BODY",
  kind: "run_completed" as const,
  organizationId: "11111111-1111-1111-1111-111111111111",
  ...overrides,
});

beforeEach(() => {
  insertMany.mockReset();
  insertMany.mockResolvedValue(undefined);
  chainMock.mockReset();
  jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe("sendEmail — what is written to the log", () => {
  it("writes a sent row naming the provider, the type and the organisation", async () => {
    const gmail = transport("gmail", { ok: { messageId: "<abc@mail.gmail.com>" } });
    chainMock.mockReturnValue([gmail]);

    await sendEmail(mail());
    await flush();

    expect(rows()).toEqual([
      {
        organizationId: "11111111-1111-1111-1111-111111111111",
        toEmail: "person@company.com",
        subject: "Run completed — Smoke — ServiceDesk4u",
        kind: "run_completed",
        status: "sent",
        provider: "gmail",
        fallback: false,
        providerMessageId: "<abc@mail.gmail.com>",
        note: null,
      },
    ]);
  });

  it("writes a failed row naming the provider that failed, and still rejects", async () => {
    const boom = transport("script_relay", { fail: "Apps Script responded 500: boom" });
    chainMock.mockReturnValue([boom]);

    const rejection = sendEmail(mail());
    await expect(rejection).rejects.toThrow("Apps Script responded 500: boom");
    await expect(rejection).rejects.toBeInstanceOf(EmailSendError);
    await flush();

    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({
      status: "failed",
      provider: "script_relay",
      fallback: false,
      providerMessageId: null,
      note: "Apps Script responded 500: boom",
    });
  });

  it("writes a skipped row with NO provider when mail is not configured, and resolves undefined", async () => {
    chainMock.mockReturnValue([transport("gmail", { configured: false })]);

    await expect(sendEmail(mail())).resolves.toBeUndefined();
    await flush();

    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({
      status: "skipped",
      provider: null,
      fallback: false,
      note: "gmail is not configured",
    });
  });

  it("never reaches a provider for a skipped email", async () => {
    const gmail = transport("gmail", { configured: false });
    chainMock.mockReturnValue([gmail]);

    await sendEmail(mail());

    expect(gmail.send).not.toHaveBeenCalled();
  });

  it("writes one row per recipient, all with the same outcome", async () => {
    chainMock.mockReturnValue([transport("gmail", { ok: { messageId: "m-1" } })]);

    await sendEmail(mail({ to: ["a@company.com", "b@company.com", "c@company.com"] }));
    await flush();

    expect(rows().map((r) => [r.toEmail, r.status, r.provider])).toEqual([
      ["a@company.com", "sent", "gmail"],
      ["b@company.com", "sent", "gmail"],
      ["c@company.com", "sent", "gmail"],
    ]);
  });

  it("records no kind, rather than failing, when a caller leaves it out", async () => {
    chainMock.mockReturnValue([transport("gmail", { ok: {} })]);

    await sendEmail(mail({ kind: undefined }));
    await flush();

    expect(rows()[0].kind).toBeNull();
  });
});

describe("sendEmail — which provider is recorded", () => {
  it("records the BACKUP, with fallback = true and a note, when the main provider failed and a backup sent it", async () => {
    const main = transport("gmail", { fail: "Invalid login: 535" });
    const backup = transport("script_relay", { ok: { messageId: "relay-7" } });
    chainMock.mockReturnValue([main, backup]);

    await expect(sendEmail(mail())).resolves.toBeUndefined();
    await flush();

    expect(main.send).toHaveBeenCalledTimes(1);
    expect(backup.send).toHaveBeenCalledTimes(1);
    expect(rows()[0]).toMatchObject({
      status: "sent",
      provider: "script_relay",
      fallback: true,
      providerMessageId: "relay-7",
      note: "gmail failed (Invalid login: 535); sent through script_relay",
    });
  });

  it("does not try the backup when the main provider sends it", async () => {
    const main = transport("gmail", { ok: {} });
    const backup = transport("script_relay", { ok: {} });
    chainMock.mockReturnValue([main, backup]);

    await sendEmail(mail());
    await flush();

    expect(backup.send).not.toHaveBeenCalled();
    expect(rows()[0]).toMatchObject({ provider: "gmail", fallback: false, note: null });
  });

  it("records the LAST provider tried, fallback = true and every error in order, when all of them fail", async () => {
    chainMock.mockReturnValue([
      transport("gmail", { fail: "Invalid login: 535" }),
      transport("script_relay", { fail: "Apps Script responded 500: boom" }),
    ]);

    const rejection = sendEmail(mail());
    await expect(rejection).rejects.toMatchObject({ provider: "script_relay", fallback: true });
    await flush();

    expect(rows()[0]).toMatchObject({
      status: "failed",
      provider: "script_relay",
      fallback: true,
      note: "gmail: Invalid login: 535; script_relay: Apps Script responded 500: boom",
    });
  });

  it("records fallback = false when the only provider fails", async () => {
    chainMock.mockReturnValue([transport("gmail", { fail: "Invalid login: 535" })]);

    await expect(sendEmail(mail())).rejects.toThrow("Invalid login: 535");
    await flush();

    expect(rows()[0]).toMatchObject({ status: "failed", provider: "gmail", fallback: false, note: "Invalid login: 535" });
  });

  it("skips an unconfigured provider in the chain and sends through the next without calling it a fallback failure", async () => {
    const unset = transport("gmail", { configured: false });
    const relay = transport("script_relay", { ok: {} });
    chainMock.mockReturnValue([unset, relay]);

    await sendEmail(mail());
    await flush();

    expect(unset.send).not.toHaveBeenCalled();
    expect(rows()[0]).toMatchObject({ status: "sent", provider: "script_relay", fallback: false });
  });
});

describe("sendEmail — reserved test addresses", () => {
  it.each(["qa@acme.test", "qa@acme.example", "qa@acme.invalid", "qa@acme.localhost", "qa@localhost", "QA@Acme.TEST", "Qa <qa@acme.test>"])(
    "skips %s without sending",
    async (to) => {
      const gmail = transport("gmail", { ok: {} });
      chainMock.mockReturnValue([gmail]);

      await expect(sendEmail(mail({ to }))).resolves.toBeUndefined();
      await flush();

      expect(gmail.send).not.toHaveBeenCalled();
      expect(rows()).toHaveLength(1);
      expect(rows()[0]).toMatchObject({ status: "skipped", provider: null, fallback: false });
      expect(rows()[0].note).toMatch(/reserved test address/i);
    }
  );

  it.each(["person@example.com", "person@test.com", "person@company.io", "person@mytest.org"])("does NOT skip %s", (to) => {
    expect(isReservedTestAddress(to)).toBe(false);
  });

  it("sends to the real recipients and skips only the reserved one in a mixed list", async () => {
    const gmail = transport("gmail", { ok: { messageId: "m-9" } });
    chainMock.mockReturnValue([gmail]);

    await sendEmail(mail({ to: ["real@company.com", "qa@acme.test", "also@company.com"] }));
    await flush();

    expect(gmail.send.mock.calls[0][0].to).toEqual(["real@company.com", "also@company.com"]);
    expect(rows().map((r) => [r.toEmail, r.status, r.provider])).toEqual([
      ["qa@acme.test", "skipped", null],
      ["real@company.com", "sent", "gmail"],
      ["also@company.com", "sent", "gmail"],
    ]);
  });

  it("hands the transport the recipients untouched when none is reserved", async () => {
    const gmail = transport("gmail", { ok: {} });
    chainMock.mockReturnValue([gmail]);

    await sendEmail(mail({ to: "person@company.com" }));

    expect(gmail.send.mock.calls[0][0].to).toBe("person@company.com");
  });
});

describe("sendEmail — what the log must never hold", () => {
  it("never stores the body or the text, only the listed columns", async () => {
    chainMock.mockReturnValue([transport("gmail", { ok: {} })]);

    await sendEmail(mail());
    await flush();

    expect(Object.keys(rows()[0]).sort()).toEqual(
      ["fallback", "kind", "note", "organizationId", "provider", "providerMessageId", "status", "subject", "toEmail"].sort()
    );
    expect(JSON.stringify(rows())).not.toContain("SECRET BODY");
  });

  it.each([
    ["verification", "Email verification code"],
    ["password_reset", "Password reset code"],
    ["ticket_lookup_code", "Ticket lookup code"],
    ["welcome", "Account created (sign-in details)"],
    ["supporter_invite", "Support account created (sign-in details)"],
  ])("stores a fixed label instead of the subject for %s", async (kind, label) => {
    chainMock.mockReturnValue([transport("gmail", { ok: {} })]);

    await sendEmail(mail({ kind, subject: "Your code is 482913" }));
    await flush();

    expect(rows()[0].subject).toBe(label);
    expect(JSON.stringify(rows())).not.toContain("482913");
  });

  it("keeps the real subject for an ordinary kind", async () => {
    chainMock.mockReturnValue([transport("gmail", { ok: {} })]);

    await sendEmail(mail({ kind: "bug_new", subject: "New bug — Login is slow — ServiceDesk4u" }));
    await flush();

    expect(rows()[0].subject).toBe("New bug — Login is slow — ServiceDesk4u");
  });

  it("truncates every value to its column, so a long error cannot make the insert fail", async () => {
    const long = "x".repeat(2000);
    chainMock.mockReturnValue([transport("gmail", { fail: long })]);

    await expect(sendEmail(mail({ subject: long, to: `${long}@company.com` }))).rejects.toThrow();
    await flush();

    const row = rows()[0];
    expect(row.toEmail.length).toBeLessThanOrEqual(255);
    expect(row.subject.length).toBeLessThanOrEqual(300);
    expect(row.note.length).toBeLessThanOrEqual(600);
  });
});

describe("sendEmail — recording can never break or change sending", () => {
  it("returns the provider's response unchanged when the log's insert fails", async () => {
    const info = { messageId: "<x@y>", accepted: ["person@company.com"] };
    chainMock.mockReturnValue([transport("gmail", { ok: { raw: info } })]);
    insertMany.mockRejectedValue(new Error("connection terminated"));

    await expect(sendEmail(mail())).resolves.toBe(info);
    await flush();
  });

  it("still rejects with the ORIGINAL error when sending failed and the log's insert fails too", async () => {
    chainMock.mockReturnValue([transport("gmail", { fail: "Invalid login: 535" })]);
    insertMany.mockImplementation(() => {
      throw new Error("log is down"); // synchronously, not just a rejected promise
    });

    await expect(sendEmail(mail())).rejects.toThrow("Invalid login: 535");
    await flush();
  });

  it("still resolves undefined for a skipped email when the log's insert fails", async () => {
    chainMock.mockReturnValue([transport("gmail", { configured: false })]);
    insertMany.mockRejectedValue(new Error("connection terminated"));

    await expect(sendEmail(mail())).resolves.toBeUndefined();
    await flush();
  });

  it("does not wait for the log before resolving", async () => {
    chainMock.mockReturnValue([transport("gmail", { ok: { raw: "ok" } })]);
    insertMany.mockReturnValue(new Promise(() => {})); // never settles

    await expect(sendEmail(mail())).resolves.toBe("ok");
  });

  it("warns once for a run of failed inserts, not once per email", async () => {
    chainMock.mockReturnValue([transport("gmail", { ok: {} })]);
    insertMany.mockRejectedValue(new Error("connection terminated"));
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    // The shared singleton may already have warned in an earlier test.
    const { EmailLogService } = require("../../../../modules/emailLog/services/emailLog.service");
    (EmailLogService.Instance as any).warned = false;

    await sendEmail(mail());
    await sendEmail(mail());
    await sendEmail(mail());
    await flush();

    const logWarnings = warn.mock.calls.filter(([m]) => String(m).startsWith("[emailLog]"));
    expect(logWarnings).toHaveLength(1);
  });
});
