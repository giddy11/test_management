// pages/public/TermsPage.tsx — the Terms & Conditions at /terms. Public: no
// account needed, and reachable while signed in.
import { LegalLayout } from "@/components/legal/LegalLayout"
import { TERMS_AND_CONDITIONS } from "@/components/legal/terms"

export default function TermsPage() {
  return (
    <LegalLayout
      document={TERMS_AND_CONDITIONS}
      counterpart={{ label: "Privacy Policy", to: "/privacy" }}
    />
  )
}
