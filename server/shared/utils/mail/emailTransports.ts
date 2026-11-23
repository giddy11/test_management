// shared/utils/mail/emailTransports.ts
//
// How a message physically leaves the server, one transport per provider, and
// the chain that tries them in order.
//
// The contract the email log depends on: a transport ALWAYS says which provider
// it was. On success it returns { provider, messageId?, fallback, note? }; on
// failure it throws an EmailSendError carrying { provider, fallback, note }.
// Nothing downstream works out a provider by reading an error string.
//
// Today the chain has one transport, picked by EMAIL_PROVIDER, so a failure is
// final. runChain is written for more than one — the main provider failing and a
// backup sending — so adding a backup later is a change to transportChain()
// only, and the log records it correctly from the first day.
import {
  EmailSendError,
  type EmailProviderCode,
  type EmailSendResult,
} from "./emailProviders";

const nodemailer = require("nodemailer");
const { env } = require("../../../config/env");

// What a transport is handed.
export interface OutgoingMessage {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

export interface EmailTransport {
  provider: EmailProviderCode;
  // False when its credentials are missing: the message is skipped, not failed.
  isConfigured(): boolean;
  notConfiguredReason: string;
  send(message: OutgoingMessage): Promise<EmailSendResult>;
}

// Apps Script cold starts can take several seconds; don't let a hung request
// pin a fire-and-forget send forever.
const SCRIPT_TIMEOUT_MS = 15000;

// The error text that goes into the log. The Apps Script URL and the SMTP
// password are secrets (anyone holding the URL can send as the script's owner),
// so if a library error ever echoes one, it is blanked out before it is stored.
function describe(error: unknown): string {
  let message = error instanceof Error ? error.message : String(error);
  for (const secret of [env.email.scriptUrl, env.email.password]) {
    if (secret && secret.length >= 6) message = message.split(secret).join("[hidden]");
  }
  return message || "Unknown error";
}

function failure(provider: EmailProviderCode, error: unknown): EmailSendError {
  const message = describe(error);
  return new EmailSendError(message, { provider, fallback: false, note: message, cause: error });
}

// ── Gmail SMTP (Nodemailer) ────────────────────────────────────────────────────
let transporter: { sendMail: (m: unknown) => Promise<any>; verify: () => Promise<unknown> } | null = null;

function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: env.email.user, pass: env.email.password },
  });
  return transporter!;
}

// Verifies SMTP credentials/connection without sending anything. Gmail only —
// an Apps Script web app has no send-free way to be checked.
export async function verifyGmailTransport() {
  return getTransporter().verify();
}

export const gmailTransport: EmailTransport = {
  provider: "gmail",
  isConfigured: () => Boolean(env.email.user && env.email.password),
  notConfiguredReason: "Gmail SMTP is not configured (EMAIL_USER / EMAIL_PASSWORD are not set)",
  async send({ to, subject, html, text }) {
    try {
      const info = await getTransporter().sendMail({ from: env.email.from, to, subject, html, text });
      const messageId = typeof info?.messageId === "string" ? info.messageId : undefined;
      return { provider: "gmail", messageId, fallback: false, raw: info };
    } catch (e) {
      throw failure("gmail", e);
    }
  },
};

// ── Google Apps Script web app ──────────────────────────────────────────────────
// The sender is whichever Google account owns the script, so env.email.from is
// not used on this path.
async function deliverViaScript({ to, subject, html, text }: OutgoingMessage): Promise<{ messageId?: string }> {
  // fetch follows the web app's redirect to script.googleusercontent.com (the
  // `curl -L`), which is where the script's response actually lives.
  const res = await fetch(env.email.scriptUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to: Array.isArray(to) ? to.join(",") : to,
      subject,
      htmlBody: html,
      body: text,
    }),
    signal: AbortSignal.timeout(SCRIPT_TIMEOUT_MS),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`Apps Script responded ${res.status}: ${raw.slice(0, 200)}`);
  // Apps Script answers 200 with an HTML page both when the script crashes and
  // when the deployment demands a Google login, so a 2xx alone proves nothing.
  if ((res.headers.get("content-type") || "").includes("text/html")) {
    throw new Error(
      'Apps Script returned an HTML page — check the script\'s execution log and that the web app is deployed with access "Anyone"'
    );
  }
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    return {}; // plain-text success
  }
  if (data && (data.success === false || data.status === "error" || data.error)) {
    throw new Error(`Apps Script rejected the email: ${data.error || data.message || raw.slice(0, 200)}`);
  }
  // The script may report an id for the message; nothing requires it to.
  const id = data?.messageId ?? data?.id;
  return { messageId: typeof id === "string" ? id : undefined };
}

export const scriptRelayTransport: EmailTransport = {
  provider: "script_relay",
  isConfigured: () => Boolean(env.email.scriptUrl),
  notConfiguredReason: "The Apps Script relay is not configured (EMAIL_SCRIPT_URL is not set)",
  async send(message) {
    try {
      const { messageId } = await deliverViaScript(message);
      return { provider: "script_relay", messageId, fallback: false };
    } catch (e) {
      throw failure("script_relay", e);
    }
  },
};

// ── Choosing ────────────────────────────────────────────────────────────────────
// Providers in the order they are tried. EMAIL_PROVIDER names the main one, and
// there is no backup configured, so this is a chain of one. A backup is added by
// appending its transport here.
export function transportChain(): EmailTransport[] {
  return [env.email.provider === "script" ? scriptRelayTransport : gmailTransport];
}

// Tries each transport in order until one accepts the message.
//  - the first one accepts it: its own result, fallback = false;
//  - a later one accepts it: that provider, fallback = true, and a note saying
//    who failed and why;
//  - every one fails: throws, naming the LAST provider tried, fallback = true
//    when more than one was tried, and each provider's error in the order tried.
export async function runChain(chain: EmailTransport[], message: OutgoingMessage): Promise<EmailSendResult> {
  // The sender skips the message before it gets here when nothing is configured.
  if (!chain.length) throw new Error("runChain needs at least one transport");
  const failed: Array<{ provider: EmailProviderCode; reason: string }> = [];

  for (const transport of chain) {
    try {
      const result = await transport.send(message);
      if (!failed.length) return result;
      const earlier = failed.map((f) => `${f.provider} failed (${f.reason})`).join("; ");
      return { ...result, fallback: true, note: `${earlier}; sent through ${result.provider}` };
    } catch (e) {
      const provider = e instanceof EmailSendError ? e.provider : transport.provider;
      failed.push({ provider, reason: e instanceof EmailSendError ? e.note : describe(e) });
    }
  }

  const last = failed[failed.length - 1];
  const note = failed.length === 1 ? last.reason : failed.map((f) => `${f.provider}: ${f.reason}`).join("; ");
  throw new EmailSendError(failed.length === 1 ? last.reason : note, {
    provider: last.provider,
    fallback: failed.length > 1,
    note,
  });
}
