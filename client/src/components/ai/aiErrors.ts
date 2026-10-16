// components/ai/aiErrors.ts — splitting a server error into per-field messages,
// so key and address problems show beside the field rather than as a toast.
// The server's message is always shown as-is: it never contains a provider's
// raw error or the key.
import { ApiError } from "@/transport/http"

export interface FieldErrors {
  fields: Record<string, string>
  general: string | null
}

export function fieldErrors(err: unknown): FieldErrors {
  if (!err) return { fields: {}, general: null }
  if (err instanceof ApiError) {
    const fields: Record<string, string> = {}
    for (const e of err.errors ?? []) {
      // validate() reports "body.apiKey"; services report "apiKey".
      const name = e.field.replace(/^(body|params|query)\./, "")
      fields[name] ??= e.message
    }
    return { fields, general: Object.keys(fields).length ? null : err.message }
  }
  return { fields: {}, general: "Something went wrong. Please try again." }
}
