// components/legal/types.ts — shape of a legal document rendered by LegalLayout.
import type { ReactNode } from "react"

export interface LegalSection {
  /** Anchor id — part of the public URL (/privacy#retention), so keep stable. */
  id: string
  title: string
  body: ReactNode
}

export interface LegalDocument {
  eyebrow: string
  title: string
  intro: string
  /** Human-readable dates; update both whenever the text changes materially. */
  lastUpdated: string
  effective: string
  sections: LegalSection[]
}
