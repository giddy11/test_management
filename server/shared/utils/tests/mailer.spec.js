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
    from: "TestMate <sender@gmail.com>",
    scriptUrl: SCRIPT_URL,
  });
  mockSendMail.mockResolvedValue({ messageId: "m1" });
  global.fetch = jest.fn().mockResolvedValue(scriptReply('{"success":true}'));
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());
afterAll(() => Object.assign(env.email, original));

describe("send() — provider: nodemailer", () => {
  it("sends through SMTP with the configured From and never calls the script", async () => {
    await send(message);

    expect(mockSendMail).toHaveBeenCalledWith({
      from: "TestMate <sender@gmail.com>",
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
