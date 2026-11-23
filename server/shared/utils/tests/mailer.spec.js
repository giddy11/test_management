// shared/utils/tests/mailer.spec.js
// EMAIL_PROVIDER picks how send() delivers mail — Nodemailer SMTP or a Google
// Apps Script web app — and every send*Email goes through that one function.
// Nodemailer and fetch are faked; nothing here touches the network.

const mockSendMail = jest.fn();
jest.mock("nodemailer", () => ({
  createTransport: jest.fn(() => ({ sendMail: mockSendMail, verify: jest.fn() })),
}));
jest.mock("../../../modules/user/repositories/user.repository", () => ({
  UserRepository: { Instance: { findOrgOwner: jest.fn() } },
}));
// send() also writes the email log; keep that off the (stubbed) database.
const mockInsertMany = jest.fn();
jest.mock("../../../modules/emailLog/repositories/emailLog.repository", () => ({
  EmailLogRepository: { Instance: { insertMany: (...args) => mockInsertMany(...args) } },
}));

const { env } = require("../../../config/env");
const { send } = require("../mailer");

const SCRIPT_URL = "https://script.google.com/macros/s/TEST_ID/exec";
const message = {
  to: "recipient@example.com",
  subject: "AB10 School",
  html: "<h1>Welcome!</h1>",
  text: "Welcome!",
};

function scriptReply(body, { status = 200, contentType = "application/json" } = {}) {
  return new Response(body, { status, headers: { "content-type": contentType } });
}

const original = { ...env.email };

beforeEach(() => {
  Object.assign(env.email, {
    provider: "nodemailer",
    user: "sender@gmail.com",
    password: "app-password",
    from: "ServiceDesk4u <sender@gmail.com>",
    scriptUrl: SCRIPT_URL,
  });
  mockSendMail.mockResolvedValue({ messageId: "m1" });
  mockInsertMany.mockResolvedValue(undefined);
  global.fetch = jest.fn().mockResolvedValue(scriptReply('{"success":true}'));
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());
afterAll(() => Object.assign(env.email, original));

describe("send() — provider: nodemailer", () => {
  it("sends through SMTP with the configured From and never calls the script", async () => {
    await send(message);

    expect(mockSendMail).toHaveBeenCalledWith({
      from: "ServiceDesk4u <sender@gmail.com>",
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("skips quietly (no throw) when SMTP credentials are missing", async () => {
    env.email.password = "";

    await expect(send(message)).resolves.toBeUndefined();
    expect(mockSendMail).not.toHaveBeenCalled();
  });
});

describe("send() — provider: script", () => {
  beforeEach(() => {
    env.email.provider = "script";
  });

  it("POSTs the Apps Script JSON contract and never uses SMTP", async () => {
    await send(message);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe(SCRIPT_URL);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body)).toEqual({
      to: "recipient@example.com",
      subject: "AB10 School",
      htmlBody: "<h1>Welcome!</h1>",
      body: "Welcome!",
    });
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("joins an array of recipients into the comma-separated string the script takes", async () => {
    await send({ ...message, to: ["a@example.com", "b@example.com"] });

    expect(JSON.parse(global.fetch.mock.calls[0][1].body).to).toBe("a@example.com,b@example.com");
  });

  it("treats a plain-text 200 as success", async () => {
    global.fetch.mockResolvedValue(scriptReply("Success", { contentType: "text/plain" }));

    await expect(send(message)).resolves.toBeUndefined();
  });

  it("skips quietly (no throw) when EMAIL_SCRIPT_URL is missing", async () => {
    env.email.scriptUrl = "";

    await expect(send(message)).resolves.toBeUndefined();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("throws on a non-2xx response", async () => {
    global.fetch.mockResolvedValue(scriptReply("boom", { status: 500, contentType: "text/plain" }));

    await expect(send(message)).rejects.toThrow(/Apps Script responded 500/);
  });

  it("throws on an HTML page — a crashed script or a login-gated deployment answers 200 with one", async () => {
    global.fetch.mockResolvedValue(scriptReply("<html>Sign in</html>", { contentType: "text/html; charset=utf-8" }));

    await expect(send(message)).rejects.toThrow(/HTML page/);
  });

  it.each([
    ['{"success":false,"error":"Quota exceeded"}', /Quota exceeded/],
    ['{"status":"error","message":"Invalid recipient"}', /Invalid recipient/],
    ['{"error":"Service invoked too many times"}', /too many times/],
  ])("throws when the script reports failure in JSON: %s", async (body, expected) => {
    global.fetch.mockResolvedValue(scriptReply(body));

    await expect(send(message)).rejects.toThrow(expected);
  });
});

// send() writes one email_logs row per recipient saying which provider was
// responsible. The real transports run here (only nodemailer and fetch are faked),
// so these prove the provider recorded is the one that actually handled the mail.
describe("send() — the email log", () => {
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  const rows = () => mockInsertMany.mock.calls.flatMap(([batch]) => batch);
  const tagged = { ...message, kind: "bug_new", organizationId: "org-1" };

  it("records a Gmail send as provider gmail, with the id Gmail returned", async () => {
    await send(tagged);
    await flush();

    expect(rows()).toEqual([
      {
        organizationId: "org-1",
        toEmail: "recipient@example.com",
        subject: "AB10 School",
        kind: "bug_new",
        status: "sent",
        provider: "gmail",
        fallback: false,
        providerMessageId: "m1",
        note: null,
      },
    ]);
  });

  it("records an Apps Script send as provider script_relay", async () => {
    env.email.provider = "script";

    await send(tagged);
    await flush();

    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({ status: "sent", provider: "script_relay", fallback: false });
  });

  it("records the id the script reports, when it reports one", async () => {
    env.email.provider = "script";
    global.fetch.mockResolvedValue(scriptReply('{"success":true,"messageId":"script-msg-1"}'));

    await send(tagged);
    await flush();

    expect(rows()[0].providerMessageId).toBe("script-msg-1");
  });

  it("records a failed Gmail send as failed / gmail with the SMTP error, and still throws it", async () => {
    mockSendMail.mockRejectedValue(new Error("Invalid login: 535 Authentication failed"));

    await expect(send(tagged)).rejects.toThrow("Invalid login: 535 Authentication failed");
    await flush();

    expect(rows()[0]).toMatchObject({
      status: "failed",
      provider: "gmail",
      fallback: false,
      note: "Invalid login: 535 Authentication failed",
    });
  });

  it("records a failed script send as failed / script_relay", async () => {
    env.email.provider = "script";
    global.fetch.mockResolvedValue(scriptReply("boom", { status: 500, contentType: "text/plain" }));

    await expect(send(tagged)).rejects.toThrow(/Apps Script responded 500/);
    await flush();

    expect(rows()[0]).toMatchObject({ status: "failed", provider: "script_relay", note: "Apps Script responded 500: boom" });
  });

  it.each([
    ["Gmail credentials", () => (env.email.password = ""), "nodemailer", /EMAIL_USER \/ EMAIL_PASSWORD/],
    ["the script URL", () => (env.email.scriptUrl = ""), "script", /EMAIL_SCRIPT_URL/],
  ])("records a send skipped for missing %s with no provider at all", async (_what, unset, provider, reason) => {
    env.email.provider = provider;
    unset();

    await expect(send(tagged)).resolves.toBeUndefined();
    await flush();

    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({ status: "skipped", provider: null, fallback: false });
    expect(rows()[0].note).toMatch(reason);
  });

  it("never lets a secret reach the log: the Apps Script URL is blanked out of an error", async () => {
    env.email.provider = "script";
    global.fetch.mockRejectedValue(new Error(`request to ${SCRIPT_URL} failed`));

    await expect(send(tagged)).rejects.toThrow();
    await flush();

    expect(rows()[0].note).toBe("request to [hidden] failed");
    expect(JSON.stringify(rows())).not.toContain("TEST_ID");
  });

  it("returns exactly what it always did when the log cannot be written", async () => {
    mockInsertMany.mockRejectedValue(new Error("connection terminated"));

    await expect(send(tagged)).resolves.toEqual({ messageId: "m1" });
    await flush();
  });
});

describe("EMAIL_PROVIDER validation", () => {
  const saved = process.env.EMAIL_PROVIDER;
  afterEach(() => {
    if (saved === undefined) delete process.env.EMAIL_PROVIDER;
    else process.env.EMAIL_PROVIDER = saved;
  });

  function loadEnv(value) {
    process.env.EMAIL_PROVIDER = value;
    let loaded;
    jest.isolateModules(() => {
      loaded = require("../../../config/env").env;
    });
    return loaded;
  }

  it("rejects an unknown provider at startup instead of silently falling back", () => {
    expect(() => loadEnv("smtp")).toThrow(/Invalid EMAIL_PROVIDER "smtp"/);
  });

  it("accepts either provider, ignoring case and surrounding whitespace", () => {
    expect(loadEnv(" Script ").email.provider).toBe("script");
    expect(loadEnv("nodemailer").email.provider).toBe("nodemailer");
  });
});
