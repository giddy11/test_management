// modules/emailLog/domain/emailLogRow.ts
//
// What one email_logs row is, and the rules for turning "an email just went
// out" into one. Pure: no I/O, so the privacy rules are testable on their own.
//
// The log never stores a message body or an attachment — there is nowhere on
// the row to put one — and it stores a fixed label instead of the subject for
// the kinds whose message carries a secret.
import { SUBJECT_REDACTED_LABELS, isEmailKind } from "../../../shared/utils/mail/emailKinds";
import type { EmailProviderCode } from "../../../shared/utils/mail/emailProviders";

export const EMAIL_LOG_STATUSES = ["sent", "failed", "skipped"] as const;
export type EmailLogStatus = (typeof EMAIL_LOG_STATUSES)[number];

// Days a row is kept before the retention job deletes it.
export const EMAIL_LOG_RETENTION_DAYS = 90;

// The column widths in the email_logs migration. A value longer than its column
// would make the INSERT fail and the row would be lost, so every value is cut
// to fit first.
export const EMAIL_LOG_LIMITS = {
  toEmail: 255,
  subject: 300,
  kind: 40,
  provider: 30,
  providerMessageId: 150,
  note: 600,
} as const;

// One email to one recipient, as the sender describes it.
export interface EmailLogInput {
  organizationId?: string | null;
  to: string;
  subject: string;
  kind?: string | null;
  status: EmailLogStatus;
  // The provider RESPONSIBLE for the email; null when none was ever chosen.
  provider?: EmailProviderCode | null;
  // True when the main provider failed and a backup handled it.
  fallback?: boolean;
  providerMessageId?: string | null;
  // The error, the reason it was skipped, or what happened on the way.
  note?: string | null;
}

// The row as inserted.
export interface EmailLogRow {
  organizationId: string | null;
  toEmail: string;
  subject: string;
  kind: string | null;
  status: EmailLogStatus;
  provider: string | null;
  fallback: boolean;
  providerMessageId: string | null;
  note: string | null;
}

// Cuts to `max` characters, ending in an ellipsis when something was removed.
// Counts code points, not UTF-16 units, so an emoji is never split in half.
export function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  const chars = Array.from(value);
  if (chars.length <= max) return value;
  return `${chars.slice(0, max - 1).join("")}…`;
}

const clip = (value: string | null | undefined, max: number): string | null => {
  if (value === null || value === undefined) return null;
  const text = String(value);
  return text === "" ? null : truncate(text, max);
};

// The subject the log keeps: the real one, unless the kind's message carries a
// secret, in which case a fixed label.
export function loggedSubject(kind: string | null | undefined, subject: string): string {
  const label = isEmailKind(kind) ? SUBJECT_REDACTED_LABELS[kind] : undefined;
  return label ?? subject;
}

export function toLogRow(input: EmailLogInput): EmailLogRow {
  return {
    organizationId: input.organizationId || null,
    toEmail: truncate(String(input.to ?? ""), EMAIL_LOG_LIMITS.toEmail),
    subject: truncate(loggedSubject(input.kind, String(input.subject ?? "")), EMAIL_LOG_LIMITS.subject),
    kind: clip(input.kind, EMAIL_LOG_LIMITS.kind),
    status: input.status,
    provider: clip(input.provider, EMAIL_LOG_LIMITS.provider),
    fallback: Boolean(input.fallback),
    providerMessageId: clip(input.providerMessageId, EMAIL_LOG_LIMITS.providerMessageId),
    note: clip(input.note, EMAIL_LOG_LIMITS.note),
  };
}
