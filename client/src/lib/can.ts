// lib/can.ts — the client half of the authorization helper.
//
// THIS IS FOR USABILITY ONLY. Hiding a control here is a courtesy; the API
// re-checks every one of these permissions on every request. Never treat a
// client-side `can()` as a security boundary — see docs/access-model.md.
//
// Mirrors the server's shared/access/can.js exactly, including the wildcard.

export const WILDCARD = "*"

export function can(permissions: string[] | undefined | null, code: string): boolean {
  if (!permissions) return false
  return permissions.includes(WILDCARD) || permissions.includes(code)
}

export function canAny(permissions: string[] | undefined | null, codes: string[]): boolean {
  return codes.some((code) => can(permissions, code))
}

export function canAll(permissions: string[] | undefined | null, codes: string[]): boolean {
  return codes.every((code) => can(permissions, code))
}
