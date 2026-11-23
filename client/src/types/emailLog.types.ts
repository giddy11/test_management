// types/emailLog.types.ts — the platform admin's email log.

export type EmailLogStatus = "sent" | "failed" | "skipped"

// Mirrors EMAIL_PROVIDER_CODES on the server (shared/utils/mail/emailProviders.ts).
export type EmailProviderCode = "gmail" | "script_relay"

// The provider filter's "rows with no provider" value.
export const NO_PROVIDER = "none"

export interface EmailLogEntry {
  id: string
  createdAt: string
  to: string
  subject: string
  // A code from EMAIL_KINDS on the server. Typed as a string so a code this
  // client has no label for yet still arrives, and is shown as it is.
  kind: string | null
  status: EmailLogStatus
  // The provider RESPONSIBLE for the email; null when none was ever chosen.
  provider: string | null
  // True when the main provider failed and `provider` is the backup that sent it.
  fallback: boolean
  providerMessageId: string | null
  // The error, the reason it was skipped, or what happened on the way.
  note: string | null
  organizationId: string | null
  organizationName: string | null
}

export type EmailLogSummary = Record<EmailLogStatus, number>

// The filters the table and the tiles share (the tiles ignore `status`).
export interface EmailLogFilters {
  status?: EmailLogStatus
  kind?: string
  // A provider code, or NO_PROVIDER.
  provider?: string
  search?: string
}

// What goes over the wire: the filters plus the period's exact window
// (ISO instants — `from` inclusive, `to` exclusive).
export interface EmailLogQuery extends EmailLogFilters {
  from?: string
  to?: string
  page?: number
  limit?: number
}
