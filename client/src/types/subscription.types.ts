// types/subscription.types.ts — which plan an organisation is on, and what each
// plan unlocks. Mirrors server/modules/subscription.

export type PlanKey = "free" | "standard" | "enterprise"
export type FeatureKey = "it_requests" | "whatsapp_widget" | "sla_escalations" | "custom_roles"
export type LimitKey =
  | "full_seats"
  | "projects"
  | "test_cases"
  | "client_companies"
  | "storage_gb"
  | "ai_credits_monthly"
  | "activity_log_days"

export type FeatureSet = Record<FeatureKey, boolean>
/** null = unlimited. */
export type LimitSet = Record<LimitKey, number | null>

export interface PlanEntitlements {
  features: FeatureSet
  limits: LimitSet
}

/** free: never had a paid plan. expired: a trial or paid period has ended (now on Free). */
export type PlanStatus = "free" | "active" | "trial" | "expired"

export interface EffectivePlan {
  /** The plan the organisation gets right now. */
  planKey: PlanKey
  planName: string
  status: PlanStatus
  /** The plan on record; differs from planKey once it has expired. */
  assignedPlanKey: PlanKey
  trialEndsAt: string | null
  paidUntil: string | null
  source: "manual" | "offline_payment" | null
  note: string | null
  features: FeatureSet
  limits: LimitSet
}

export type PaymentMethod = "bank_transfer" | "cash" | "cheque" | "pos" | "mobile_money" | "other"

export interface PlanCatalog {
  plans: { key: PlanKey; name: string }[]
  features: { key: FeatureKey; label: string; description: string }[]
  limits: { key: LimitKey; label: string; unit: string }[]
  paymentMethods: PaymentMethod[]
  entitlements: Record<PlanKey, PlanEntitlements>
}

export interface SubscriptionPayment {
  id: string
  planKey: PlanKey
  planName: string
  amount: number
  currency: string
  method: PaymentMethod
  reference: string | null
  paidAt: string
  periodStart: string
  periodEnd: string
  note: string | null
  recordedBy: string | null
  createdAt: string
}

export interface OrganizationPlanDetail {
  subscription: EffectivePlan
  payments: SubscriptionPayment[]
}

export interface SetPlanPayload {
  planKey: PlanKey
  status: "active" | "trial"
  trialEndsAt?: string | null
  paidUntil?: string | null
  note?: string | null
}

export interface RecordPaymentPayload {
  planKey: Exclude<PlanKey, "free">
  amount: number
  currency: string
  method: PaymentMethod
  reference?: string | null
  paidAt: string
  months: number
  note?: string | null
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  bank_transfer: "Bank transfer",
  cash: "Cash",
  cheque: "Cheque",
  pos: "POS / card terminal",
  mobile_money: "Mobile money",
  other: "Other",
}
