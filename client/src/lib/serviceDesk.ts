// lib/serviceDesk.ts — plain helpers for the IT-requests components (kept out
// of the component files so fast refresh keeps working).
import type { NeededByWarning } from "@/types/serviceDesk.types"

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

// A needed_by answer is a plain YYYY-MM-DD; read it as that calendar day here,
// not as midnight UTC, so it never shows as the day before.
export function formatNeededBy(date: string, long = false): string {
  const [y, m, d] = date.split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, long ? { weekday: "short", day: "numeric", month: "long", year: "numeric" } : { day: "numeric", month: "short" })
}

export const NEEDED_BY_WARNING_TEXT: Record<NeededByWarning, string> = {
  passed: "This date has passed and the request isn't done yet.",
  after_target: "The service-level target is later than this date, so finishing on target would still miss it.",
  soon: "This date is less than two days away.",
}
