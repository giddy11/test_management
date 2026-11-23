// types/pricing.types.ts — the landing page's pricing section.
// Mirrors server/modules/pricing/domain/defaultPricing.ts.

export interface PricingPlan {
  /** Stable slug, unique within the list. */
  id: string
  name: string
  description: string
  /** Whole currency units. 0 shows as a free plan. */
  monthlyPrice: number
  /** The price for a full year, shown when yearly billing is picked. */
  yearlyPrice: number
  /** The line under the price, e.g. which seats are included. */
  seatNote: string
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
