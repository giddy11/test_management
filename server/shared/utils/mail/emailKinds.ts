// shared/utils/mail/emailKinds.ts
//
// THE list of email types ServiceDesk4u sends. Every send() call names one, and
// it is stored in email_logs.kind (varchar 40) so the platform admin can filter
// the email log by type. A leaf module on purpose: no imports.
//
// Adding an email: add its kind here, pass it from the send*Email builder, and
// add its label to client/src/lib/emailLogLabels.ts. Never rename a kind — old
// log rows keep the code they were written with.

export const EMAIL_KINDS = [
  // Account and sign-in
  "verification",
  "password_reset",
  "ticket_lookup_code",
  "welcome",
  // Testing
  "test_assigned",
  "run_completed",
  "project_member_added",
  // Feedback tickets
  "feedback_received",
  "feedback_status",
  "feedback_comment",
  "feedback_mention",
  "feedback_new_alert",
  "feedback_assigned",
  "ticket_transcript",
  // Feature requests
  "feature_request_new",
  "feature_request_status",
  "feature_request_assigned",
  "feature_request_comment",
  "feature_request_mention",
  // Bugs
  "bug_new",
  "bug_status",
  "bug_comment",
  "bug_mention",
  "bug_assigned",
  // Client-company IT support
  "supporter_invite",
  "support_queue_alert",
  "support_status",
  "support_resolution",
  "support_item_assigned",
  "support_chat_alert",
  "feedback_escalated",
  "feedback_closed_supporter",
  // IT requests (one template, many events)
  "service_request",
] as const;

export type EmailKind = (typeof EMAIL_KINDS)[number];

export function isEmailKind(value: unknown): value is EmailKind {
  return typeof value === "string" && (EMAIL_KINDS as readonly string[]).includes(value);
}

// Kinds whose message carries a secret (a one-time code, a temporary password).
// The log stores this fixed label instead of the real subject, so the secret
// can never reach the table even if a subject one day starts to include it.
// Today those subjects are fixed strings and the secret sits in the body, so
// this is defence in depth: it costs the admin nothing, the Type column already
// says what the email was.
export const SUBJECT_REDACTED_LABELS: Partial<Record<EmailKind, string>> = {
  verification: "Email verification code",
  password_reset: "Password reset code",
  ticket_lookup_code: "Ticket lookup code",
  welcome: "Account created (sign-in details)",
  supporter_invite: "Support account created (sign-in details)",
};
