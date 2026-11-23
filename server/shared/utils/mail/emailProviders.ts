// shared/utils/mail/emailProviders.ts
//
// THE list of mail providers this server can send through, and the contract
// every transport honours. A leaf module on purpose (no imports): the sender,
// the email-log validator and the tests all read it, and it must never pull
// any of them back in.
//
// Adding a provider: add its code here, add a transport for it in
// emailTransports.ts, and add its label to client/src/lib/emailLogLabels.ts.
// The code is what is stored in email_logs.provider, so never rename one.

export const EMAIL_PROVIDER_CODES = [
  "gmail", // Gmail SMTP, through Nodemailer (EMAIL_PROVIDER=nodemailer)
  "script_relay", // a Google Apps Script web app (EMAIL_PROVIDER=script)
] as const;

export type EmailProviderCode = (typeof EMAIL_PROVIDER_CODES)[number];

export function isEmailProviderCode(value: unknown): value is EmailProviderCode {
  return typeof value === "string" && (EMAIL_PROVIDER_CODES as readonly string[]).includes(value);
}

// What a transport returns when the provider accepted the message.
export interface EmailSendResult {
  // The provider that actually handled it — the backup, after a fallback.
  provider: EmailProviderCode;
  // The id the provider gave the message, for tracing it in the provider's own
  // dashboard. Absent when the provider returns none.
  messageId?: string;
  // True when the main provider failed and a backup sent it.
  fallback: boolean;
  // What happened on the way, e.g. "gmail failed (...); sent through script_relay".
  note?: string;
  // The provider's own response, handed back to send()'s caller unchanged.
  raw?: unknown;
}

export interface EmailSendErrorDetails {
  provider: EmailProviderCode;
  fallback: boolean;
  note: string;
  cause?: unknown;
}

// What a transport throws when the message was NOT accepted. It carries which
// provider was involved, so the log never has to be worked out by parsing an
// error string. `message` is the underlying error's message, unchanged, so
// callers that only log `err.message` see exactly what they always did.
export class EmailSendError extends Error {
  readonly provider: EmailProviderCode;
  readonly fallback: boolean;
  readonly note: string;

  constructor(message: string, details: EmailSendErrorDetails) {
    super(message, details.cause === undefined ? undefined : { cause: details.cause });
    this.name = "EmailSendError";
    this.provider = details.provider;
    this.fallback = details.fallback;
    this.note = details.note;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
