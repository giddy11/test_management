// lib/pricingBenefits.ts — what each pricing card lists. The same rules as the
// server (server/modules/pricing/domain/defaultPricing.ts), so the editor's
// preview matches the landing page before anything is saved.
import type { PricingBenefit, PricingContent, PricingPlan } from "@/types/pricing.types"
import type { FeatureKey, LimitKey, PlanEntitlements, PlanKey } from "@/types/subscription.types"

export const FEATURE_NAMES: Record<FeatureKey, string> = {
  it_requests: "IT requests",
  whatsapp_widget: "WhatsApp widget",
  sla_escalations: "SLA escalations",
  custom_roles: "Custom roles",
}

export const LIMIT_NAMES: Record<LimitKey, string> = {
  full_seats: "Full seats",
  projects: "Projects",
  test_cases: "Test cases",
  client_companies: "Client companies",
  storage_gb: "Storage",
  ai_credits_monthly: "AI credits",
  activity_log_days: "Activity history",
}

/** Each plan's features and limits as being edited; null when the viewer can't manage plans. */
export type PlanValues = Record<PlanKey, PlanEntitlements> | null

const SINGULAR: Record<string, string> = {
  projects: "project",
  cases: "case",
  credits: "credit",
  days: "day",
  seats: "seat",
  companies: "company",
}

/** "Projects" (or "{n} projects") with 1000 → "1,000 projects", with 1 → "1 project"; no limit → the unlimited wording; 0 → nothing. */
export function limitLine(benefit: PricingBenefit, value: number | null): string | null {
  if (value === null) return benefit.unlimitedLabel.trim() || null
  if (value <= 0) return null
  const num = value.toLocaleString("en-US")
  const raw = benefit.label.trim()
  let line: string
  if (raw.includes("{n}")) {
    line = raw.split("{n}").join(num)
  } else if (/^up to\b/i.test(raw)) {
    const rest = raw.replace(/^up to\s*/i, "")
    line = `Up to ${num} ${rest}`
  } else {
    const rest = /^(GB|AI)\b/.test(raw) ? raw : raw.charAt(0).toLowerCase() + raw.slice(1)
    line = `${num} ${rest}`
  }
  return value === 1 ? line.replace(/\b(projects|cases|credits|days|seats|companies)\b/gi, (w) => SINGULAR[w.toLowerCase()] ?? w) : line
}

/** Whether the benefit's checkbox is ticked for this card. */
export function isTicked(plan: PricingPlan, benefit: PricingBenefit, values: PlanValues): boolean {
  if (benefit.feature && plan.planKey) {
    // Without plan values, the server's last answer (plan.features) stands in.
    return values ? values[plan.planKey]?.features[benefit.feature] === true : plan.features.includes(benefit.label)
  }
  if (benefit.limit && plan.planKey && values) {
    const val = values[plan.planKey]?.limits[benefit.limit]
    if (val !== null && val !== undefined && val <= 0) return false
  }
  return plan.benefitIds.includes(benefit.id)
}

/** The line this card shows for the benefit, or null when it shows none. */
export function cardLine(plan: PricingPlan, benefit: PricingBenefit, values: PlanValues): string | null {
  if (!isTicked(plan, benefit, values)) return null
  if (benefit.limit) {
    if (!plan.planKey || !values) return null
    return limitLine(benefit, values[plan.planKey]?.limits[benefit.limit] ?? null)
  }
  return benefit.label
}

/**
 * Replaces the seat count in the seat note (or "{n}" if written) with the
 * plan's "Full seats included" limit ("unlimited" / "Unlimited" when it has
 * none), so the user can write "Includes 15 full seats. Extra seats $2 each."
 * and the number still follows the plan's full-seat limit automatically.
 */
export function seatLine(plan: PricingPlan, values: PlanValues): string {
  if (!plan.planKey) return plan.seatNote.includes("{n}") ? "" : plan.seatNote
  if (!values) return plan.seatLine ?? plan.seatNote
  const seats = values[plan.planKey]?.limits.full_seats
  if (seats === undefined) return plan.seatNote
  const formatted = seats === null ? "unlimited" : seats.toLocaleString("en-US")
  let line: string
  if (plan.seatNote.includes("{n}")) {
    line = plan.seatNote.split("{n}").join(formatted)
  } else {
    line = plan.seatNote.replace(/\b(\d[\d,]*|unlimited)\b(?=\s+(?:full\s+)?seats?\b)/i, (match) => {
      if (seats === null && /^[A-Z]/.test(match)) return "Unlimited"
      return formatted
    })
  }
  if (seats === 1) return line.replace(/\bseats\b/g, "seat")
  return line.replace(/\b((?:\d[\d,]*|unlimited)\s+(?:full\s+)?)seat\b/gi, "$1seats")
}

/** The draft with every card's list filled in, for the preview. */
export function resolvePlanFeatures(content: PricingContent, values: PlanValues): PricingContent {
  return {
    ...content,
    plans: content.plans.map((p) => ({
      ...p,
      seatLine: seatLine(p, values),
      features: content.benefits.map((b) => cardLine(p, b, values)).filter((line): line is string => !!line),
    })),
  }
}

/** A new benefit's id: readable, and unique within the list. */
export function newBenefitId(label: string, taken: string[]): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 30) || "benefit"
  let id = base
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`
  return id
}
