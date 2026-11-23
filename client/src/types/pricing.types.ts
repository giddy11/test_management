// types/pricing.types.ts — the landing page's pricing section.
// Mirrors server/modules/pricing/domain/defaultPricing.ts.
import type { FeatureKey, LimitKey, PlanKey } from "@/types/subscription.types"

/** One line a plan card can list. Ticked per plan in the editor. */
export interface PricingBenefit {
  id: string
  label: string
  /** Set when the benefit is a feature the app enforces; it then shows exactly when the plan includes it. */
  feature: FeatureKey | null
  /** Set when the benefit shows a plan limit; the label then has "{n}" where each plan's number goes. */
  limit: LimitKey | null
  /** For a limit benefit: the wording when the plan has no limit. Empty hides the line. */
  unlimitedLabel: string
}

export interface PricingPlan {
  /** Stable slug, unique within the list. */
  id: string
  /** Which plan in the app this card sells. null for a card that isn't a real plan. */
  planKey: PlanKey | null
  name: string
  description: string
  /** Whole currency units. 0 shows as a free plan. */
  monthlyPrice: number
  /** The price for a full year, shown when yearly billing is picked. */
  yearlyPrice: number
  /** The line under the price, e.g. which seats are included. "{n}" becomes the plan's full-seat limit. */
  seatNote: string
  /** seatNote with "{n}" filled in. Worked out on every read, read-only. */
  seatLine?: string
  /** The ticked benefits (other than enforced features on a card with a planKey). */
  benefitIds: string[]
  /** What the card lists, worked out from the benefits. Read-only. */
  features: string[]
  ctaLabel: string
  /** A path inside the app ("/register"), an https:// link or a mailto: link. */
  ctaHref: string
  /** Off hides the plan from the landing page without deleting it. */
  isVisible: boolean
  highlighted: boolean
  /** Small label above the card, e.g. "Most popular". Empty means none. */
  badge: string
}

export interface PricingContent {
  isVisible: boolean
  eyebrow: string
  heading: string
  subheading: string
  currencySymbol: string
  yearlyDiscountLabel: string
  footnote: string
  /** Shown on a card in this order. */
  benefits: PricingBenefit[]
  plans: PricingPlan[]
}

/** What the platform owner's editor gets back. */
export interface PricingView {
  content: PricingContent
  /** True while nothing has been saved and the built-in defaults are shown. */
  isDefault: boolean
  updatedAt: string | null
}

export type BillingPeriod = "monthly" | "yearly"
