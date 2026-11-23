// lib/emailLogLabels.ts — friendly names for the email log's codes.
//
// The server stores stable codes; this is the only place they get words. A code
// with no entry here (a provider or email type added on the server before this
// file) is shown as it is, never hidden.
import type { EmailLogStatus, EmailProviderCode } from "@/types/emailLog.types"

// Mirrors EMAIL_PROVIDER_CODES on the server.
export const EMAIL_PROVIDER_LABELS: Record<EmailProviderCode, string> = {
  gmail: "Gmail SMTP",
  script_relay: "Apps Script relay",
}

export const EMAIL_PROVIDER_CODES = Object.keys(EMAIL_PROVIDER_LABELS) as EmailProviderCode[]

// null = no provider was chosen (the email was skipped before any was tried).
export function providerLabel(code: string | null | undefined): string {
  if (!code) return "—"
  return (EMAIL_PROVIDER_LABELS as Record<string, string>)[code] ?? code
}

// Mirrors EMAIL_KINDS on the server.
export const EMAIL_KIND_LABELS: Record<string, string> = {
  verification: "Email verification code",
  password_reset: "Password reset code",
  ticket_lookup_code: "Ticket lookup code",
  welcome: "Welcome — new account",
  test_assigned: "Test assigned",
  run_completed: "Run completed",
  project_member_added: "Added to a project",
  feedback_received: "Feedback received",
  feedback_status: "Feedback status update",
  feedback_comment: "Ticket message",
  feedback_mention: "Ticket mention",
  feedback_new_alert: "New feedback alert",
  feedback_assigned: "Feedback assigned",
  ticket_transcript: "Ticket transcript",
  feature_request_new: "New feature request",
  feature_request_status: "Feature request update",
  feature_request_assigned: "Feature request assigned",
  feature_request_comment: "Feature request comment",
  feature_request_mention: "Feature request mention",
  bug_new: "New bug",
  bug_status: "Bug status update",
  bug_comment: "Bug comment",
  bug_mention: "Bug mention",
  bug_assigned: "Bug assigned",
  supporter_invite: "Supporter account invite",
  support_queue_alert: "Support queue alert",
  support_status: "Support status update",
  support_resolution: "Support resolution",
  support_item_assigned: "Support ticket assigned",
  support_chat_alert: "Support chat alert",
  feedback_escalated: "Feedback escalated",
  feedback_closed_supporter: "Escalated feedback closed",
  service_request: "IT request",
}

export function kindLabel(code: string | null | undefined): string {
  if (!code) return "—"
  return EMAIL_KIND_LABELS[code] ?? code
}

// For the type filter, alphabetical by what the admin reads.
export const EMAIL_KIND_OPTIONS = Object.entries(EMAIL_KIND_LABELS)
  .map(([value, label]) => ({ value, label }))
  .sort((a, b) => a.label.localeCompare(b.label))

export const EMAIL_STATUSES: EmailLogStatus[] = ["sent", "failed", "skipped"]

// What each status means. "Sent" is the one people over-read: it is what the
// mail provider said, not what the recipient's inbox did.
export const EMAIL_STATUS_META: Record<EmailLogStatus, { label: string; hint: string; badge: string; tile: string }> = {
  sent: {
    label: "Sent",
    hint: "The mail provider accepted the message. This does not prove it reached the recipient's inbox — it can still bounce or land in spam.",
    badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    tile: "text-emerald-700 dark:text-emerald-400",
  },
  failed: {
    label: "Failed",
    hint: "Sending threw an error. The note says what the provider reported.",
    badge: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
    tile: "text-red-700 dark:text-red-400",
  },
  skipped: {
    label: "Skipped",
    hint: "Deliberately not sent: mail is not configured, or the address is a reserved test address (.test, .example, .invalid, .localhost).",
    badge: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    tile: "text-slate-600 dark:text-slate-400",
  },
}

export function statusLabel(status: string): string {
  return (EMAIL_STATUS_META as Record<string, { label: string }>)[status]?.label ?? status
}
