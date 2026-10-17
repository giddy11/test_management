// lib/serviceDesk.ts — plain helpers for the IT-requests components (kept out
// of the component files so fast refresh keeps working).
import type { RequestAutomationRun } from "@/types/serviceDesk.types"

// The icon names the server's default catalog uses (CategoryIcon maps them).
export const CATEGORY_ICON_CHOICES = [
  "app-window",
  "laptop",
  "user-plus",
  "key-round",
  "briefcase",
  "cloud",
  "id-card",
  "lightbulb",
] as const

// Server errors arrive as { field: "formValues.software", message } — pick
// out the ones that belong to form fields, keyed by the field's key.
export function formFieldErrors(errors: { field: string; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const e of errors) {
    if (e.field.startsWith("formValues.")) out[e.field.slice("formValues.".length)] = e.message
  }
  return out
}

export type RequestedFor =
  | { mode: "me" }
  | { mode: "colleague"; person: { id: string; name: string; email: string } | null }
  | { mode: "new"; name: string; email: string }

export function requestedForPayload(v: RequestedFor) {
  if (v.mode === "colleague" && v.person) return { requestedForId: v.person.id, requestedForName: null, requestedForEmail: null }
  if (v.mode === "new") return { requestedForId: null, requestedForName: v.name.trim() || null, requestedForEmail: v.email.trim() || null }
  return { requestedForId: null, requestedForName: null, requestedForEmail: null }
}

// One readable sentence for a run.
export function describeRun(r: Pick<RequestAutomationRun, "kind" | "status" | "ruleName" | "endpointName" | "attempt" | "reason" | "note" | "error" | "initiatedByName">): string {
  const by = r.initiatedByName ? ` (started by ${r.initiatedByName})` : ""
  switch (r.kind) {
    case "rule":
      return `Rule "${r.ruleName ?? "deleted rule"}" applied`
    case "auto_approve":
      return r.status === "succeeded"
        ? `Approved automatically by "${r.ruleName}"`
        : `Not approved automatically: ${r.reason ?? "not allowed"}`
    case "webhook":
      if (r.status === "skipped") return `Connector didn't start: ${r.reason ?? r.error ?? "stepped aside"}`
      return `Sent to ${r.endpointName ?? "a connector"}${r.attempt > 1 ? ` (attempt ${r.attempt})` : ""}${by}${r.error ? ` — ${r.error}` : ""}${r.note ? ` — ${r.note}` : ""}`
    case "deflect":
      return "Used the self-service link"
    case "ai_triage":
      return `AI triage${by}`
  }
}
