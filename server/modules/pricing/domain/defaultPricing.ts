// modules/pricing/domain/defaultPricing.ts
// What the landing page's pricing section shows until the platform owner saves
// their own version, and what "Reset to defaults" goes back to. Taken from the
// draft pricing model (docs/TestMate_Pricing_Model.html, version 0.5).

export interface PricingPlan {
  // Stable slug, unique within the list. Used as the React key and the
  // data-cy hook, so renaming a plan doesn't change it.
  id: string;
  name: string;
  description: string;
  // Whole currency units. 0 shows as a free plan.
  monthlyPrice: number;
  // The price for a full year, shown when a visitor picks yearly billing.
  yearlyPrice: number;
  // The line under the price, e.g. which seats are included.
  seatNote: string;
  features: string[];
  ctaLabel: string;
  // A path inside the app ("/register"), an https:// link or a mailto: link.
  ctaHref: string;
  // Off keeps the plan saved but hides it from the landing page.
  isVisible: boolean;
  highlighted: boolean;
  // Small label above the card, e.g. "Most popular". Empty means none.
  badge: string;
}

export interface PricingContent {
  // Off hides the section (and its header link) from the landing page.
  isVisible: boolean;
  eyebrow: string;
  heading: string;
  subheading: string;
  currencySymbol: string;
  // Shown next to the "Yearly" option, e.g. "2 months free". Empty hides it.
  yearlyDiscountLabel: string;
  footnote: string;
  plans: PricingPlan[];
}

export const DEFAULT_PRICING: PricingContent = Object.freeze({
  isVisible: true,
  eyebrow: "Pricing",
  heading: "Simple pricing that grows with your team",
  subheading:
    "Start free. Pay one flat monthly price when you need the IT service desk. People who only submit requests or tickets never need a seat.",
  currencySymbol: "$",
  yearlyDiscountLabel: "2 months free",
  footnote:
    "Prices in USD, excluding tax. Every new organisation gets a 14-day Standard trial with no card. Non-profits and education get 30% off.",
  plans: [
    {
      id: "free",
      name: "Free",
      description: "For small QA teams getting their testing in order.",
      monthlyPrice: 0,
      yearlyPrice: 0,
      seatNote: "3 full seats. No credit card.",
      features: [
        "3 projects, 1,000 test cases",
        "Suites, cases, test runs and result history",
        "Bug tracking and feature requests with voting",
        "Spreadsheet import and export",
        "Public ticket portal (1 project)",
        "Live chat widget with ServiceDesk4u branding",
        "AI with your own key, plus 50 trial credits",
      ],
      ctaLabel: "Start for free",
      ctaHref: "/register",
      isVisible: true,
      highlighted: false,
      badge: "",
    },
    {
      id: "standard",
      name: "Standard",
      description: "For growing teams running testing and an IT service desk together.",
      monthlyPrice: 9,
      yearlyPrice: 90,
      seatNote: "Includes 15 full seats. Extra seats $2 each.",
      features: [
        "Everything in Free, no project or case limits",
        "IT request portal, service catalog, forms and approvals",
        "Service queue for IT agents, request deadlines",
        "Client companies (up to 10) with two-tier support",
        "SLA tracking with your own targets and breach escalations",
        "Live chat and WhatsApp widgets, unbranded",
        "100 AI credits each month, shared by the team",
        "1-year activity log and email support",
      ],
      ctaLabel: "Start 14-day trial",
      ctaHref: "/register",
      isVisible: true,
      highlighted: true,
      badge: "Most popular",
    },
    {
      id: "enterprise",
      name: "Enterprise",
      description: "For organisations and service providers that need control and scale.",
      monthlyPrice: 39,
      yearlyPrice: 390,
      seatNote: "Includes 50 full seats. Extra seats $1.50 each.",
      features: [
        "Everything in Standard, unlimited client companies",
        "Custom roles and permissions",
        "Multi-step approvals with approver groups",
        "Identity checks before sensitive requests",
        "Full service reports and provisioning API",
        "500 AI credits each month, model choice per feature",
        "Unlimited activity log retention",
        "Priority support and onboarding",
      ],
      ctaLabel: "Get started",
      ctaHref: "/register",
      isVisible: true,
      highlighted: false,
      badge: "",
    },
  ],
}) as PricingContent;
