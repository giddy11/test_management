// shared/utils/mail/emailSender.ts
//
// THE one place ServiceDesk4u mail is sent from. mailer.js exports it as send(),
// and every send*Email builder, in mailer.js and in shared/utils/mail/*.mail.ts,
// goes through it. Besides sending, it writes the email log: one row per
// recipient saying sent / failed / skipped and WHICH PROVIDER was responsible.
//
// What callers see does not change. It resolves with the provider's own
// response, resolves undefined when the mail was skipped, and rejects when
// sending failed (with an EmailSendError, whose message is the underlying
// error's message). Logging is added around that and never into it: it is not
// awaited, and EmailLogService.record cannot throw.
import { EmailLogService } from "../../../modules/emailLog/services/emailLog.service";
import type { EmailLogInput } from "../../../modules/emailLog/domain/emailLogRow";
import type { EmailKind } from "./emailKinds";
import { EmailSendError } from "./emailProviders";
import { runChain, transportChain, type OutgoingMessage } from "./emailTransports";

export interface OutgoingEmail extends OutgoingMessage {
  // What sort of email this is. Required here so a typed call site cannot forget
  // it; a JavaScript caller that does is logged without a type, not blocked.
  kind: EmailKind;
  // The organisation the recipient belongs to, when there is one.
  organizationId?: string | null;
}

// Addresses that can never receive mail (RFC 2606 / 6761 reserved names). Test
// data and local development use them; sending to one only fills a provider's
// bounce log, so they are skipped and logged as such.
const RESERVED_TLDS = ["test", "example", "invalid", "localhost"];

export function isReservedTestAddress(recipient: string): boolean {
  // "Name <person@host.test>" → person@host.test
  const bracketed = /<([^>]+)>/.exec(recipient);
  const address = (bracketed ? bracketed[1] : recipient).trim();
  const at = address.lastIndexOf("@");
  if (at < 0) return false;
  const domain = address.slice(at + 1).trim().toLowerCase().replace(/\.$/, "");
  return RESERVED_TLDS.some((tld) => domain === tld || domain.endsWith(`.${tld}`));
}

const RESERVED_NOTE = `Reserved test address (.${RESERVED_TLDS.join(", .")}) — not sent`;

function recipientsOf(to: string | string[]): string[] {
  const list = Array.isArray(to) ? to : String(to ?? "").split(/[,;]/);
  return list.map((r) => String(r).trim()).filter(Boolean);
}

// Hands rows to the log without waiting for it and without letting it fail the
// send. record() already swallows database errors; the try/catch and the
// .catch cover the log being replaced by something that doesn't.
function record(rows: EmailLogInput[]): void {
  try {
    void Promise.resolve(EmailLogService.Instance.record(rows)).catch(() => {});
  } catch {
    // Logging is best-effort by design.
  }
}

export async function sendEmail(message: OutgoingEmail): Promise<unknown> {
  // A message with no recipient is a caller's bug. It still goes to the
  // transport, which rejects it as it always has, and the failure is logged.
  const listed = recipientsOf(message.to);
  const recipients = listed.length ? listed : [""];
  const reserved = recipients.filter(isReservedTestAddress);
  const deliverable = recipients.filter((r) => !isReservedTestAddress(r));

  const row = (to: string, rest: Pick<EmailLogInput, "status"> & Partial<EmailLogInput>): EmailLogInput => ({
    organizationId: message.organizationId ?? null,
    to,
    subject: message.subject,
    kind: message.kind ?? null,
    ...rest,
  });

  const rows: EmailLogInput[] = reserved.map((to) => row(to, { status: "skipped", provider: null, note: RESERVED_NOTE }));

  if (!deliverable.length) {
    record(rows);
    return undefined;
  }

  // Only configured providers are tried; with none, the mail is skipped before
  // any provider was chosen, so no provider is recorded.
  const chain = transportChain().filter((t) => t.isConfigured());
  if (!chain.length) {
    const reason = transportChain()[0].notConfiguredReason;
    console.warn(`[mailer] ${reason} — skipping send to`, message.to);
    record([...rows, ...deliverable.map((to) => row(to, { status: "skipped", provider: null, note: reason }))]);
    return undefined;
  }

  // Everyone is deliverable: hand the transport the recipients exactly as given.
  const to = reserved.length ? deliverable : message.to;
  try {
    const result = await runChain(chain, { to, subject: message.subject, html: message.html, text: message.text });
    record([
      ...rows,
      ...deliverable.map((r) =>
        row(r, {
          status: "sent",
          provider: result.provider,
          fallback: result.fallback,
          providerMessageId: result.messageId ?? null,
          note: result.note ?? null,
        })
      ),
    ]);
    return result.raw;
  } catch (error) {
    const known = error instanceof EmailSendError ? error : null;
    record([
      ...rows,
      ...deliverable.map((r) =>
        row(r, {
          status: "failed",
          provider: known?.provider ?? null,
          fallback: known?.fallback ?? false,
          note: known?.note ?? (error instanceof Error ? error.message : String(error)),
        })
      ),
    ]);
    throw error;
  }
}
