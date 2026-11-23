// endpoints/emailLog.endpoints.ts — the platform admin's email log (read-only).
import { wrapCall } from "@/transport/http"
import type { EmailLogEntry, EmailLogQuery, EmailLogSummary } from "@/types/emailLog.types"

// Axios drops undefined params, so unset filters simply aren't sent.
export const EmailLogEndpoints = {
  list: (query: EmailLogQuery) =>
    wrapCall<EmailLogEntry[]>("GET", "/api/v1/email-logs", query as Record<string, unknown>),

  // The tiles: counts per status for the same filters, minus the status filter.
  summary: (query: Omit<EmailLogQuery, "status" | "page" | "limit">) =>
    wrapCall<EmailLogSummary>("GET", "/api/v1/email-logs/summary", query as Record<string, unknown>),
}
