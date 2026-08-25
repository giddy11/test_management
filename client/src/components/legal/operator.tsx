// components/legal/operator.tsx — the deployment-specific details both legal
// documents depend on, in one place.
//
// ─────────────────────────────────────────────────────────────────────────────
// BEFORE PUBLISHING
//   1. Replace every value below that is wrapped in <Placeholder> with the real
//      one. Grep for "Placeholder" to find them — they render as dashed amber
//      chips on the page, so an unfinished document is obvious at a glance.
//   2. Have both documents reviewed by a qualified lawyer in your jurisdiction.
//      They are drafted from what this codebase actually does, but they are not
//      legal advice and have not been reviewed.
//   3. Re-check the sub-processor table in privacy.tsx against your live
//      deployment whenever infrastructure changes.
// ─────────────────────────────────────────────────────────────────────────────
import { Placeholder } from "@/components/legal/prose"

/** Product name, as used throughout both documents. */
export const PRODUCT_NAME = "TestMate"

/** Kept in sync manually — shown in both documents' title bands. */
export const LAST_UPDATED = "25 August 2026"
export const EFFECTIVE_DATE = "25 August 2026"

// Where privacy requests and legal notices go. The overview deck gives one
// support address for everything; split these out if you set up dedicated
// privacy and legal inboxes.
export const PRIVACY_EMAIL = "support@thegrowthplug.com"
export const LEGAL_EMAIL = "support@thegrowthplug.com"
export const SUPPORT_EMAIL = "support@thegrowthplug.com"

/** The legal entity behind this deployment. */
export function LegalEntity() {
  return <Placeholder>[Registered company name]</Placeholder>
}

/**
 * Registered office, for notices and for data-protection correspondence.
 * The deck names the United Kingdom and Nigeria as operating locations, which
 * is not the same as a registered office — that still needs filling in.
 */
export function RegisteredAddress() {
  return <Placeholder>[Registered office address]</Placeholder>
}

/** Governing law and the courts with exclusive jurisdiction. */
export function Jurisdiction() {
  return <Placeholder>[Governing law jurisdiction]</Placeholder>
}

/** Supervisory authority a data subject may complain to. */
export function SupervisoryAuthority() {
  return <Placeholder>[Supervisory authority]</Placeholder>
}
