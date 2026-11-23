// types/organization.types.ts
import type { EffectivePlan } from "@/types/subscription.types"
export interface OrganizationSummary {
  organizationId: string
  name: string
  ownerName: string
  ownerEmail: string
  userCount: number
  projectCount: number
  createdAt: string
  plan: Pick<EffectivePlan, "planKey" | "planName" | "status" | "assignedPlanKey" | "paidUntil" | "trialEndsAt" | "source" | "includedSeats" | "extraSeats">
}

export interface FetchOrganizationsParams {
  page?: number
  limit?: number
  search?: string
}
