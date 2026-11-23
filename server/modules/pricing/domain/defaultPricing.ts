// modules/pricing/domain/defaultPricing.ts
// What the landing page's pricing section shows until the platform owner saves
// their own version, and what "Reset to defaults" goes back to. Taken from the
// draft pricing model (docs/TestMate_Pricing_Model.html, version 0.5).
//
// Benefits are one shared list, ticked per plan, rather than text typed into
// each plan. A benefit linked to a feature the app enforces (IT requests,
// WhatsApp, SLA escalations, custom roles) isn't ticked here at all: it shows
// on a card exactly when that plan includes the feature (plan_entitlements),
// so the landing page can never promise what the app doesn't give.
//
// A benefit linked to a plan limit (projects, test cases, storage...) is
// written once with "{n}" where the number goes. Each card fills in its own
// plan's value from plan_entitlements: "3 projects" on Free, "Unlimited
// projects" (unlimitedLabel) on Standard. The tick only decides whether the
// card shows the line.
import {
  isPlanKey,
  type FeatureKey,
  type FeatureSet,
  type LimitKey,
  type LimitSet,
  type PlanKey,
} from "../../subscription/domain/planCatalog";

export interface PricingBenefit {
  // Stable slug, unique within the list.
  id: string;
  label: string;
  // Set when the benefit is a feature the app enforces. Only one benefit per feature.
  feature: FeatureKey | null;
  // Set when the benefit shows a plan limit; label then contains "{n}".
  // Only one benefit per limit, and never both a feature and a limit.
  limit: LimitKey | null;
  // For a limit benefit: the wording when the plan has no limit. Empty hides it.
  unlimitedLabel: string;
}

export interface PricingPlan {
  // Stable slug, unique within the list. Used as the React key and the
  // data-cy hook, so renaming a plan doesn't change it.
  id: string;
  // Which plan in the app this card sells. Decides the enforced benefits.
  // null for a card that isn't a real plan (e.g. "Contact us for custom").
  planKey: PlanKey | null;
  name: string;
  description: string;
  // Whole currency units. 0 shows as a free plan.
  monthlyPrice: number;
  // The price for a full year, shown when a visitor picks yearly billing.
  yearlyPrice: number;
  // The line under the price, e.g. which seats are included.
  seatNote: string;
  // The seat note with "{n}" filled in from the plan's "Full seats included"
  // limit. Worked out on every read, never edited (seatNote is the template).
  seatLine?: string;
  // The ticked benefits that aren't enforced features (and, for a card with
  // no planKey, the enforced ones too).
  benefitIds: string[];
  // What the card lists, worked out from the benefits on every read. Never
  // edited directly.
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
  // Shown on a card in this order.
  benefits: PricingBenefit[];
  plans: PricingPlan[];
}

type PlanIds = "free" | "standard" | "enterprise";
const ALL: PlanIds[] = ["free", "standard", "enterprise"];
const PAID: PlanIds[] = ["standard", "enterprise"];

// The default list, with which plans tick each one. Enforced benefits have no
// plans here: plan_entitlements decides them.
type DefaultBenefit = { id: string; label: string; feature?: FeatureKey; limit?: LimitKey; unlimitedLabel?: string; plans: PlanIds[] };

const DEFAULT_BENEFITS: DefaultBenefit[] = [
  { id: "seats", label: "{n} full seats included", limit: "full_seats", unlimitedLabel: "Unlimited full seats", plans: [] },
  { id: "projects", label: "{n} projects", limit: "projects", unlimitedLabel: "Unlimited projects", plans: ALL },
  { id: "test-cases", label: "{n} test cases", limit: "test_cases", unlimitedLabel: "Unlimited test cases", plans: ALL },
  { id: "testing", label: "Suites, cases, test runs and result history", plans: ALL },
  { id: "bugs", label: "Bug tracking and feature requests with voting", plans: ALL },
  { id: "import", label: "Spreadsheet import and export", plans: ALL },
  { id: "portal", label: "Public ticket portal and live chat widget", plans: ALL },
  { id: "it-requests", label: "IT requests: portal, catalog, approvals and IT queue", feature: "it_requests", plans: [] },
  { id: "client-limit", label: "Up to {n} client companies with two-tier support", limit: "client_companies", unlimitedLabel: "Unlimited client companies with two-tier support", plans: PAID },
  { id: "sla", label: "SLA tracking with your own targets", plans: PAID },
  { id: "sla-escalations", label: "SLA breach escalations", feature: "sla_escalations", plans: [] },
  { id: "whatsapp", label: "WhatsApp widget on your website", feature: "whatsapp_widget", plans: [] },
  { id: "custom-roles", label: "Custom roles and permissions", feature: "custom_roles", plans: [] },
  { id: "approvals", label: "Multi-step approvals with approver groups", plans: ["enterprise"] },
  { id: "identity", label: "Identity checks before sensitive requests", plans: ["enterprise"] },
  { id: "reports-api", label: "Full service reports and provisioning API", plans: ["enterprise"] },
  { id: "storage", label: "{n} GB attachment storage", limit: "storage_gb", unlimitedLabel: "Unlimited attachment storage", plans: ALL },
  { id: "ai", label: "AI drafting with your own key", plans: ALL },
  { id: "ai-credits", label: "{n} AI credits each month", limit: "ai_credits_monthly", unlimitedLabel: "Unlimited AI credits", plans: ALL },
  { id: "activity-log", label: "{n} days of activity history", limit: "activity_log_days", unlimitedLabel: "Unlimited activity history", plans: ALL },
  { id: "email-support", label: "Email support", plans: ["standard"] },
  { id: "priority-support", label: "Priority support and onboarding", plans: ["enterprise"] },
];

export const DEFAULT_BENEFIT_LIST: PricingBenefit[] = DEFAULT_BENEFITS.map((b) => ({
  id: b.id,
  label: b.label,
  feature: b.feature ?? null,
  limit: b.limit ?? null,
  unlimitedLabel: b.unlimitedLabel ?? "",
}));

export function defaultBenefitIds(planId: string): string[] {
  return DEFAULT_BENEFITS.filter((b) => !b.feature && b.plans.includes(planId as PlanIds)).map((b) => b.id);
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
  benefits: DEFAULT_BENEFIT_LIST,
  plans: [
    {
      id: "free",
      planKey: "free",
      name: "Free",
      description: "For small QA teams getting their testing in order.",
      monthlyPrice: 0,
      yearlyPrice: 0,
      seatNote: "{n} full seats. No credit card.",
      benefitIds: defaultBenefitIds("free"),
      features: [],
      ctaLabel: "Start for free",
      ctaHref: "/register",
      isVisible: true,
      highlighted: false,
      badge: "",
    },
    {
      id: "standard",
      planKey: "standard",
      name: "Standard",
      description: "For growing teams running testing and an IT service desk together.",
      monthlyPrice: 9,
      yearlyPrice: 90,
      seatNote: "Includes {n} full seats. Extra seats $2 each.",
      benefitIds: defaultBenefitIds("standard"),
      features: [],
      ctaLabel: "Start 14-day trial",
      ctaHref: "/register",
      isVisible: true,
      highlighted: true,
      badge: "Most popular",
    },
    {
      id: "enterprise",
      planKey: "enterprise",
      name: "Enterprise",
      description: "For organisations and service providers that need control and scale.",
      monthlyPrice: 39,
      yearlyPrice: 390,
      seatNote: "Includes {n} full seats. Extra seats $1.50 each.",
      benefitIds: defaultBenefitIds("enterprise"),
      features: [],
      ctaLabel: "Get started",
      ctaHref: "/register",
      isVisible: true,
      highlighted: false,
      badge: "",
    },
  ],
}) as PricingContent;

// ── Pricing saved before benefits became a ticked list ──────────────────────
// Each plan then had its own typed lines. Lines that were the old built-in
// defaults are covered by the new list; anything else was written by the
// platform owner and is kept, as a new benefit ticked on the plans that had it.
const OLD_DEFAULT_LINES = new Set([
  "3 projects, 1,000 test cases",
  "Suites, cases, test runs and result history",
  "Bug tracking and feature requests with voting",
  "Spreadsheet import and export",
  "Public ticket portal (1 project)",
  "Live chat widget with TestMate branding",
  "Live chat widget with ServiceDesk4u branding",
  "AI with your own key, plus 50 trial credits",
  "Everything in Free, no project or case limits",
  "IT request portal, service catalog, forms and approvals",
  "Service queue for IT agents, request deadlines",
  "Client companies (up to 10) with two-tier support",
  "SLA tracking with your own targets and breach escalations",
  "Live chat and WhatsApp widgets, unbranded",
  "100 AI credits each month, shared by the team",
  "1-year activity log and email support",
  "Everything in Standard, unlimited client companies",
  "Custom roles and permissions",
  "Multi-step approvals with approver groups",
  "Identity checks before sensitive requests",
  "Full service reports and provisioning API",
  "500 AI credits each month, model choice per feature",
  "Unlimited activity log retention",
  "Priority support and onboarding",
]);

type StoredPlan = Partial<PricingPlan> & { id: string; features?: string[] };
type StoredContent = Omit<PricingContent, "benefits" | "plans"> & { benefits?: PricingBenefit[]; plans: StoredPlan[] };

// Fixed-number rows from the previous default list, now covered by limit rows.
// "becomes" lists the limit rows that take over its ticks.
const SUPERSEDED_ROWS: Array<{ id: string; label: string; becomes: string[] }> = [
  { id: "free-limits", label: "3 projects, 1,000 test cases", becomes: ["projects", "test-cases"] },
  { id: "unlimited", label: "Unlimited projects and test cases", becomes: ["projects", "test-cases"] },
  { id: "clients", label: "Client companies with two-tier support", becomes: ["client-limit"] },
  { id: "ai-credits", label: "Monthly AI credits included", becomes: ["ai-credits"] },
  { id: "activity-log", label: "Unlimited activity log history", becomes: ["activity-log"] },
];

/**
 * Brings saved content up to the current shape: plans get their on/off switch
 * and planKey, old typed lines become benefits, and every enforced feature and
 * every plan limit has its row (they are how those are shown per plan).
 */
export function normalisePricing(stored: StoredContent): PricingContent {
  let benefits: PricingBenefit[];
  const extraIds = new Map<string, string[]>(); // plan id -> custom benefit ids
  const renamed = new Map<string, string[]>(); // superseded id -> the limit rows that take over

  if (Array.isArray(stored.benefits)) {
    benefits = [];
    for (const b of stored.benefits) {
      const old = SUPERSEDED_ROWS.find((r) => r.id === b.id && r.label === b.label && !b.limit);
      if (old) {
        renamed.set(old.id, old.becomes);
        // The replacement rows go where the old row was (once each).
        for (const id of old.becomes) {
          const def = DEFAULT_BENEFIT_LIST.find((d) => d.id === id);
          if (def && !benefits.some((b) => b.id === id)) benefits.push({ ...def });
        }
        continue;
      }
      benefits.push({
        id: b.id,
        label: b.label,
        feature: b.feature ?? null,
        limit: b.feature ? null : (b.limit ?? null),
        unlimitedLabel: b.unlimitedLabel ?? "",
      });
    }
  } else {
    benefits = DEFAULT_BENEFIT_LIST.map((b) => ({ ...b }));
    const byLabel = new Map<string, string>();
    stored.plans.forEach((p) => {
      for (const line of p.features ?? []) {
        const label = line.trim();
        if (!label || OLD_DEFAULT_LINES.has(label)) continue;
        let id = byLabel.get(label);
        if (!id) {
          id = `custom-${byLabel.size + 1}`;
          byLabel.set(label, id);
          benefits.push({ id, label, feature: null, limit: null, unlimitedLabel: "" });
        }
        extraIds.set(p.id, [...(extraIds.get(p.id) ?? []), id]);
      }
    });
  }

  // Every enforced feature and every plan limit keeps its row, so it can always
  // be ticked. Added rows start unticked.
  for (const def of DEFAULT_BENEFIT_LIST.filter((b) => b.feature || b.limit)) {
    const present = def.feature ? benefits.some((b) => b.feature === def.feature) : benefits.some((b) => b.limit === def.limit);
    if (!present) {
      const id = benefits.some((b) => b.id === def.id) ? `${def.id}-${def.feature ? "feature" : "limit"}` : def.id;
      benefits.push({ ...def, id });
    }
  }

  const known = new Set(benefits.map((b) => b.id));
  const plans: PricingPlan[] = stored.plans.map((p) => {
    const planKey = p.planKey !== undefined ? p.planKey : isPlanKey(p.id) ? p.id : null;
    const benefitIds = Array.isArray(p.benefitIds)
      ? [
          ...new Set(
            p.benefitIds
              .flatMap((id) => renamed.get(id) ?? [id])
              .filter((id) => known.has(id))
          ),
        ]
      : [...defaultBenefitIds(p.id), ...(extraIds.get(p.id) ?? [])];
    return {
      id: p.id,
      planKey,
      name: p.name ?? "",
      description: p.description ?? "",
      monthlyPrice: p.monthlyPrice ?? 0,
      yearlyPrice: p.yearlyPrice ?? 0,
      seatNote: p.seatNote ?? "",
      benefitIds,
      features: [],
      ctaLabel: p.ctaLabel ?? "Get started",
      ctaHref: p.ctaHref ?? "/register",
      isVisible: p.isVisible !== false,
      highlighted: p.highlighted ?? false,
      badge: p.badge ?? "",
    };
  });

  return { ...stored, benefits, plans };
}

const SINGULAR: Record<string, string> = {
  projects: "project",
  cases: "case",
  credits: "credit",
  days: "day",
  seats: "seat",
  companies: "company",
};

/** "{n} projects" with 1000 → "1,000 projects", with 1 → "1 project"; no limit → the unlimited wording. */
export function limitLine(benefit: PricingBenefit, value: number | null): string | null {
  if (value === null) return benefit.unlimitedLabel.trim() || null;
  // Nothing to boast about: "0 AI credits each month" stays off the card.
  if (value <= 0) return null;
  const line = benefit.label.split("{n}").join(value.toLocaleString("en-US"));
  return value === 1 ? line.replace(/\b(projects|cases|credits|days|seats|companies)\b/g, (w) => SINGULAR[w]) : line;
}

/**
 * The seat note with "{n}" replaced by the plan's "Full seats included" limit
 * ("unlimited" when it has none). A note without "{n}" is shown as typed. A card
 * that doesn't sell a real plan has no number to fill in, so a note that needs
 * one is left off.
 */
export function seatLine(seatNote: string, planKey: PlanKey | null, plans: Record<PlanKey, { limits: LimitSet }>): string {
  if (!seatNote.includes("{n}")) return seatNote;
  if (!planKey) return "";
  const seats = plans[planKey]?.limits.full_seats ?? null;
  const line = seatNote.split("{n}").join(seats === null ? "unlimited" : seats.toLocaleString("en-US"));
  return seats === 1 ? line.replace(/\b(seats)\b/g, (w) => SINGULAR[w]) : line;
}

/**
 * Fills in what each card lists, in the benefits' order:
 * - an enforced benefit on a card that sells a real plan shows exactly when
 *   that plan includes the feature;
 * - a limit benefit, when ticked, shows the plan's own number (and never on a
 *   card that doesn't sell a real plan, which has no numbers);
 * - anything else shows when it's ticked.
 */
export function resolvePlanFeatures(
  content: PricingContent,
  plans: Record<PlanKey, { features: FeatureSet; limits: LimitSet }>
): PricingContent {
  return {
    ...content,
    plans: content.plans.map((p) => ({
      ...p,
      seatLine: seatLine(p.seatNote, p.planKey, plans),
      features: content.benefits
        .map((b) => {
          if (b.feature && p.planKey) return plans[p.planKey]?.features[b.feature] === true ? b.label : null;
          if (!p.benefitIds.includes(b.id)) return null;
          if (b.limit) return p.planKey ? limitLine(b, plans[p.planKey]?.limits[b.limit] ?? null) : null;
          return b.label;
        })
        .filter((line): line is string => !!line),
    })),
  };
}
