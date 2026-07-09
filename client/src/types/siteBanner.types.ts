// types/siteBanner.types.ts
import type { BroadcastAudience } from "@/components/announcements/AudiencePicker"

export interface SiteBanner {
  message: string | null
  isActive: boolean
  expiresAt: string | null
  // Only present for the superadmin — lets the Announcements page manage the
  // banner regardless of who it's targeted at.
  audience?: BroadcastAudience
  recipientIds?: string[] | null
  durationMinutes?: number | null
}
