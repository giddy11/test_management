// modules/subscription/domain/planCatalog.ts
// What each plan actually unlocks in the app. This is separate from the pricing
// section's marketing text on purpose: the platform owner can reword a benefit
// on the landing page without changing what is enforced, and can change what
// is enforced (the checkboxes on the Pricing page) without touching the copy.
//
// The plan keys are fixed. The landing page's plan cards can be renamed,
// hidden or reordered, but an organisation is always on one of these three.

export const PLAN_KEYS = ["free", "standard", "enterprise"] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

export const PLAN_NAMES: Record<PlanKey, string> = {
  free: "Free",
  standard: "Standard",
  enterprise: "Enterprise",
};

export function isPlanKey(value: unknown): value is PlanKey {
  return typeof value === "string" && (PLAN_KEYS as readonly string[]).includes(value);
}

// ── Features: on or off per plan. Every one of these is enforced. ──────────
export const FEATURES = [
  {
    key: "it_requests",
    label: "IT requests",
    description: "The request portal, service catalog, approvals and the IT queue.",
  },
  {
    key: "whatsapp_widget",
    label: "WhatsApp widget",
    description: "The WhatsApp button on a project's own website, which logs a ticket before handing off.",
  },
  {
    key: "sla_escalations",
    label: "SLA breach escalations",
    description: "Automatic alerts and escalation contacts when tickets, bugs or requests miss their SLA.",
  },
  {
    key: "custom_roles",
    label: "Custom roles and permissions",
    description: "Creating roles, and changing which permissions a role holds.",
  },
] as const;
export type FeatureKey = (typeof FEATURES)[number]["key"];

// ── Limits: a number per plan, null meaning unlimited. The platform owner can
// set them now; nothing checks them yet (that is the next step). ───────────
export const LIMITS = [
  { key: "full_seats", label: "Full seats included", unit: "seats" },
  { key: "projects", label: "Projects", unit: "projects" },
  { key: "test_cases", label: "Test cases", unit: "cases" },
  { key: "client_companies", label: "Client companies", unit: "companies" },
  { key: "storage_gb", label: "Attachment storage", unit: "GB" },
  { key: "ai_credits_monthly", label: "AI credits each month", unit: "credits" },
  { key: "activity_log_days", label: "Activity log history", unit: "days" },
] as const;
export type LimitKey = (typeof LIMITS)[number]["key"];

export type FeatureSet = Record<FeatureKey, boolean>;
export type LimitSet = Record<LimitKey, number | null>;

export interface PlanEntitlements {
  features: FeatureSet;
  limits: LimitSet;
}

// Matches the draft pricing model (docs/TestMate_Pricing_Model.html, v0.5).
export const DEFAULT_ENTITLEMENTS: Record<PlanKey, PlanEntitlements> = {
  free: {
    features: { it_requests: false, whatsapp_widget: false, sla_escalations: false, custom_roles: false },
    limits: {
      full_seats: 3,
      projects: 3,
      test_cases: 1000,
      client_companies: 1,
      storage_gb: 1,
      ai_credits_monthly: 0,
      activity_log_days: 30,
    },
  },
  standard: {
    features: { it_requests: true, whatsapp_widget: true, sla_escalations: true, custom_roles: false },
    limits: {
      full_seats: 15,
      projects: null,
      test_cases: null,
      client_companies: 10,
      storage_gb: 5,
      ai_credits_monthly: 100,
      activity_log_days: 365,
    },
  },
  enterprise: {
    features: { it_requests: true, whatsapp_widget: true, sla_escalations: true, custom_roles: true },
    limits: {
      full_seats: 50,
      projects: null,
      test_cases: null,
      client_companies: null,
      storage_gb: 25,
      ai_credits_monthly: 500,
      activity_log_days: null,
    },
  },
};

/** Saved values over the defaults, so a feature or limit added later starts at its default. */
export function mergeEntitlements(
  planKey: PlanKey,
  saved?: { features?: Partial<FeatureSet>; limits?: Partial<LimitSet> } | null
): PlanEntitlements {
  const base = DEFAULT_ENTITLEMENTS[planKey];
  const features = { ...base.features };
  const limits = { ...base.limits };
  for (const f of FEATURES) {
    const v = saved?.features?.[f.key];
    if (typeof v === "boolean") features[f.key] = v;
  }
  for (const l of LIMITS) {
    if (saved?.limits && l.key in saved.limits) {
      const v = saved.limits[l.key];
      if (v === null || (typeof v === "number" && Number.isFinite(v))) limits[l.key] = v;
    }
  }
  return { features, limits };
}

// ── Offline payments ─────────────────────────────────────────────────────────
export const PAYMENT_METHODS = ["bank_transfer", "cash", "cheque", "pos", "mobile_money", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
