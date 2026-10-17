// lib/serviceDesk.ts — plain helpers for the IT-requests components (kept out
// of the component files so fast refresh keeps working).

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
