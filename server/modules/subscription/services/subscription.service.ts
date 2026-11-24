// modules/subscription/services/subscription.service.ts
// Which plan each organisation is on, and what that plan unlocks.
//
// - Feature checks across the app call hasFeature / assertFeature.
// - The platform owner (subscription.manage, platform-only) edits what each
//   plan unlocks, sets an organisation's plan by hand, and records payments
//   made offline (bank transfer, cash, ...).
//
// An organisation with no subscription row is on Free. A trial or a paid
// period that has ended also counts as Free; that is worked out when read, so
// nothing has to run on a schedule.
import { SubscriptionRepository } from "../repositories/subscription.repository";
import {
  FEATURES,
  LIMITS,
  PAYMENT_METHODS,
  PLAN_KEYS,
  PLAN_NAMES,
  mergeEntitlements,
  type FeatureKey,
  type FeatureSet,
  type LimitSet,
  type PaymentMethod,
  type PlanEntitlements,
  type PlanKey,
} from "../domain/planCatalog";
import type { OrganizationSubscription, SubscriptionStatus } from "../entities/organizationSubscription.entity";
import type { SubscriptionPayment } from "../entities/subscriptionPayment.entity";

const { AppError } = require("../../../shared/errors/AppError");
const { ActivityService } = require("../../activity/services/activity.service");

// Plan lookups run on many requests (every IT-request action checks one), so
// they are cached briefly. Writes here clear the cache straight away; another
// server instance catches up within this window.
const CACHE_MS = 30_000;

// How long the trial a new organisation starts with lasts.
export const TRIAL_DAYS = 14;

// none: no subscription on record at all (never set up). expired: a trial or
// paid period has ended. Both block the organisation (see "blocked") until the
// platform owner sets a plan, Free included.
export type EffectiveStatus = "none" | "active" | "trial" | "expired";

export interface EffectivePlan {
  /** The plan the organisation gets right now. */
  planKey: PlanKey;
  planName: string;
  status: EffectiveStatus;
  /**
   * The organisation can't use the app until it subscribes: it has no
   * subscription, or its trial or paid period has ended. Its data is kept and
   * Free's limits still apply on the server.
   */
  blocked: boolean;
  /** The plan on record, which differs from planKey once a trial or paid period has ended. */
  assignedPlanKey: PlanKey;
  trialEndsAt: string | null;
  paidUntil: string | null;
  source: OrganizationSubscription["source"] | null;
  note: string | null;
  /** Full seats the plan itself includes (null = unlimited). */
  includedSeats: number | null;
  /** Seats bought on top. Zero once the paid plan has ended. */
  extraSeats: number;
  features: FeatureSet;
  /** limits.full_seats is the TOTAL: included plus extra. */
  limits: LimitSet;
}

interface Actor {
  id: string;
  organizationId?: string | null;
}

export interface SetPlanInput {
  planKey: PlanKey;
  status: SubscriptionStatus;
  trialEndsAt?: string | null;
  paidUntil?: string | null;
  // Seats on top of the plan's own. Omitted = leave as they are. Free has none.
  extraSeats?: number;
  note?: string | null;
}

export interface RecordPaymentInput {
  planKey: Exclude<PlanKey, "free">;
  amount: number;
  currency: string;
  method: PaymentMethod;
  reference?: string | null;
  paidAt: string;
  // How many months this payment covers. 0 = extra seats only, for the rest of
  // the paid period that is already running (needs extraSeats).
  months: number;
  // The organisation's TOTAL extra seats from now on. Omitted = leave as they are.
  extraSeats?: number;
  note?: string | null;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  // 31 January + 1 month is the last day of February, not 3 March.
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

export class SubscriptionService {
  static Instance = new SubscriptionService();

  private entitlementCache: { at: number; value: Record<PlanKey, PlanEntitlements> } | null = null;
  private planCache = new Map<string, { at: number; value: EffectivePlan }>();

  constructor(private readonly repo = SubscriptionRepository.Instance) {}

  // ── What each plan unlocks ─────────────────────────────────────────────────
  catalog() {
    return {
      plans: PLAN_KEYS.map((key) => ({ key, name: PLAN_NAMES[key] })),
      features: FEATURES,
      limits: LIMITS,
      paymentMethods: PAYMENT_METHODS,
    };
  }

  async entitlements(): Promise<Record<PlanKey, PlanEntitlements>> {
    if (this.entitlementCache && Date.now() - this.entitlementCache.at < CACHE_MS) return this.entitlementCache.value;
    const rows = await this.repo.allEntitlements();
    const byKey = new Map(rows.map((r) => [r.planKey, r]));
    const value = Object.fromEntries(
      PLAN_KEYS.map((key) => [key, mergeEntitlements(key, byKey.get(key))])
    ) as Record<PlanKey, PlanEntitlements>;
    this.entitlementCache = { at: Date.now(), value };
    return value;
  }

  async updateEntitlements(actor: Actor, body: Record<PlanKey, PlanEntitlements>) {
    const rows = PLAN_KEYS.map((planKey) => ({ planKey, ...mergeEntitlements(planKey, body[planKey]) }));
    await this.repo.saveEntitlements(rows, actor.id);
    this.clearCaches();
    ActivityService.Instance.log(actor, {
      action: "plans.entitlements_updated",
      summary: "Changed what each plan includes",
      entityType: "plan_entitlements",
      entityId: null,
      metadata: Object.fromEntries(rows.map((r) => [r.planKey, { features: r.features, limits: r.limits }])),
    });
    return this.entitlements();
  }

  // ── An organisation's plan ─────────────────────────────────────────────────
  async current(organizationId: string): Promise<EffectivePlan> {
    const cached = this.planCache.get(organizationId);
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
    const value = this.effective(await this.repo.findSubscription(organizationId), await this.entitlements());
    this.planCache.set(organizationId, { at: Date.now(), value });
    return value;
  }

  async hasFeature(organizationId: string | null | undefined, feature: FeatureKey): Promise<boolean> {
    if (!organizationId) return false;
    return (await this.current(organizationId)).features[feature] === true;
  }

  /** Throws a 403 the client can recognise (reason "plan_feature") and turn into an upgrade prompt. */
  async assertFeature(organizationId: string | null | undefined, feature: FeatureKey): Promise<void> {
    if (await this.hasFeature(organizationId, feature)) return;
    const plan = organizationId ? await this.current(organizationId) : null;
    const label = FEATURES.find((f) => f.key === feature)?.label ?? feature;
    throw new AppError(
      `${label} isn't included in your ${plan?.planName ?? "Free"} plan. Upgrade your plan to use it.`,
      403,
      [],
      { reason: "plan_feature", feature, planKey: plan?.planKey ?? "free" }
    );
  }

  // ── Platform owner ─────────────────────────────────────────────────────────
  /** Plan per organisation for the Organisations list. Missing = Free. */
  async summaries(organizationIds: string[]): Promise<Map<string, EffectivePlan>> {
    const [rows, ent] = await Promise.all([this.repo.findSubscriptions(organizationIds), this.entitlements()]);
    const byOrg = new Map(rows.map((r) => [r.organizationId, r]));
    return new Map(organizationIds.map((id) => [id, this.effective(byOrg.get(id) ?? null, ent)]));
  }

  async detail(organizationId: string) {
    await this.assertOrganization(organizationId);
    const [subscription, payments] = await Promise.all([
      this.current(organizationId),
      this.repo.listPayments(organizationId),
    ]);
    return { subscription, payments: payments.map(paymentView) };
  }

  /** Sets the plan by hand: a trial, a complimentary plan, a downgrade, or back to Free. */
  async setPlan(actor: Actor, organizationId: string, input: SetPlanInput) {
    await this.assertOrganization(organizationId);
    const existing = await this.repo.findSubscription(organizationId);
    if (input.planKey === "free") {
      // Kept as a record, not "no subscription": an organisation put on Free
      // can use the app within Free's limits; one with no record can't.
      await this.repo.saveSubscription({
        organizationId,
        planKey: "free",
        status: "active",
        trialEndsAt: null,
        paidUntil: null,
        source: "manual",
        extraSeats: 0,
        note: input.note?.trim() || null,
        updatedBy: actor.id,
      });
    } else {
      const trialEndsAt = input.status === "trial" && input.trialEndsAt ? new Date(input.trialEndsAt) : null;
      if (input.status === "trial" && !trialEndsAt) throw new AppError("A trial needs an end date", 422);
      await this.repo.saveSubscription({
        organizationId,
        planKey: input.planKey,
        status: input.status,
        trialEndsAt,
        paidUntil: input.status === "active" && input.paidUntil ? new Date(input.paidUntil) : null,
        source: "manual",
        extraSeats: input.extraSeats ?? existing?.extraSeats ?? 0,
        note: input.note?.trim() || null,
        updatedBy: actor.id,
      });
    }
    this.planCache.delete(organizationId);
    ActivityService.Instance.log(actor, {
      action: "subscription.plan_changed",
      summary: `Set an organisation's plan to ${PLAN_NAMES[input.planKey]}${input.status === "trial" && input.planKey !== "free" ? " (trial)" : ""}`,
      entityType: "organization",
      entityId: organizationId,
      metadata: { organizationId, ...input },
    });
    return this.detail(organizationId);
  }

  /**
   * The subscription a brand-new organisation starts with, from the plan
   * picked on the pricing page: Free if they chose Free, otherwise a
   * TRIAL_DAYS trial of the paid plan they picked (Standard when they came in
   * without picking one). Never overwrites a subscription already there.
   */
  async startForNewOrganization(organizationId: string, chosen?: PlanKey | null) {
    if (await this.repo.findSubscription(organizationId)) return;
    const isFree = chosen === "free";
    await this.repo.saveSubscription({
      organizationId,
      planKey: isFree ? "free" : (chosen ?? "standard"),
      status: isFree ? "active" : "trial",
      trialEndsAt: isFree ? null : new Date(Date.now() + TRIAL_DAYS * 86_400_000),
      paidUntil: null,
      source: "signup",
      extraSeats: 0,
      note: null,
      updatedBy: null,
    });
    this.planCache.delete(organizationId);
  }

  /**
   * Records a payment made outside the app and moves the organisation onto the
   * paid plan for the months it covers. Paying again for the same plan before
   * it runs out extends it from the current end date, so no days are lost.
   */
  async recordPayment(actor: Actor, organizationId: string, input: RecordPaymentInput) {
    await this.assertOrganization(organizationId);
    const existing = await this.repo.findSubscription(organizationId);
    const now = new Date();
    const extendsCurrent =
      existing &&
      existing.status === "active" &&
      existing.planKey === input.planKey &&
      existing.paidUntil &&
      existing.paidUntil.getTime() > now.getTime();
    // Months 0: only add seats, to the paid period that is already running.
    if (input.months === 0 && !extendsCurrent) {
      throw new AppError(
        "There's no running paid period of this plan to add seats to. Choose how many months the payment covers.",
        422
      );
    }
    const periodStart = input.months === 0 ? now : extendsCurrent ? (existing!.paidUntil as Date) : now;
    const periodEnd = input.months === 0 ? (existing!.paidUntil as Date) : addMonths(periodStart, input.months);
    const extraSeats = input.extraSeats ?? existing?.extraSeats ?? 0;

    await this.repo.addPayment({
      organizationId,
      planKey: input.planKey,
      amount: input.amount.toFixed(2),
      currency: input.currency.toUpperCase(),
      method: input.method,
      reference: input.reference?.trim() || null,
      paidAt: new Date(input.paidAt),
      periodStart,
      periodEnd,
      extraSeats,
      note: input.note?.trim() || null,
      recordedBy: actor.id,
    });
    await this.repo.saveSubscription({
      organizationId,
      planKey: input.planKey,
      status: "active",
      trialEndsAt: null,
      paidUntil: periodEnd,
      source: "offline_payment",
      extraSeats,
      note: existing?.note ?? null,
      updatedBy: actor.id,
    });
    this.planCache.delete(organizationId);

    ActivityService.Instance.log(actor, {
      action: "subscription.payment_recorded",
      summary:
        input.months === 0
          ? `Recorded an offline payment of ${input.currency.toUpperCase()} ${input.amount.toFixed(2)} for ${extraSeats} extra seat${extraSeats === 1 ? "" : "s"} on ${PLAN_NAMES[input.planKey]}`
          : `Recorded an offline payment of ${input.currency.toUpperCase()} ${input.amount.toFixed(2)} for ${PLAN_NAMES[input.planKey]}, ${input.months} month${input.months === 1 ? "" : "s"}${extraSeats ? ` with ${extraSeats} extra seat${extraSeats === 1 ? "" : "s"}` : ""}`,
      entityType: "organization",
      entityId: organizationId,
      metadata: { organizationId, ...input, periodStart, periodEnd },
    });
    return this.detail(organizationId);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  private clearCaches() {
    this.entitlementCache = null;
    this.planCache.clear();
  }

  private async assertOrganization(organizationId: string) {
    if (!(await this.repo.organizationExists(organizationId))) throw new AppError("Organisation not found", 404);
  }

  private effective(row: OrganizationSubscription | null, ent: Record<PlanKey, PlanEntitlements>): EffectivePlan {
    const now = Date.now();
    let planKey: PlanKey = "free";
    let status: EffectiveStatus = "none";
    if (row) {
      const end = row.status === "trial" ? row.trialEndsAt : row.paidUntil;
      const running = end === null ? row.status === "active" : end.getTime() > now;
      planKey = running ? row.planKey : "free";
      status = running ? row.status : "expired";
    }
    // Extra seats ride with the running paid plan: gone once it has lapsed.
    const extraSeats = row && planKey !== "free" && planKey === row.planKey ? (row.extraSeats ?? 0) : 0;
    const includedSeats = ent[planKey].limits.full_seats;
    return {
      planKey,
      planName: PLAN_NAMES[planKey],
      status,
      blocked: status === "none" || status === "expired",
      assignedPlanKey: row?.planKey ?? "free",
      trialEndsAt: row?.trialEndsAt?.toISOString() ?? null,
      paidUntil: row?.paidUntil?.toISOString() ?? null,
      source: row?.source ?? null,
      note: row?.note ?? null,
      includedSeats,
      extraSeats,
      features: ent[planKey].features,
      limits: { ...ent[planKey].limits, full_seats: includedSeats === null ? null : includedSeats + extraSeats },
    };
  }
}

function paymentView(p: SubscriptionPayment) {
  return {
    id: p.id,
    planKey: p.planKey,
    planName: PLAN_NAMES[p.planKey] ?? p.planKey,
    amount: Number(p.amount),
    currency: p.currency,
    method: p.method,
    reference: p.reference,
    paidAt: p.paidAt.toISOString(),
    periodStart: p.periodStart.toISOString(),
    periodEnd: p.periodEnd.toISOString(),
    extraSeats: p.extraSeats ?? 0,
    note: p.note,
    recordedBy: p.recordedBy,
    createdAt: p.createdAt.toISOString(),
  };
}
