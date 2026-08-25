// pages/public/PrivacyPage.tsx — the Privacy Policy at /privacy. Public: no
// account needed, and reachable while signed in.
import { LegalLayout } from "@/components/legal/LegalLayout"
import { PRIVACY_POLICY } from "@/components/legal/privacy"

export default function PrivacyPage() {
  return (
    <LegalLayout
      document={PRIVACY_POLICY}
      counterpart={{ label: "Terms & Conditions", to: "/terms" }}
    />
  )
}
