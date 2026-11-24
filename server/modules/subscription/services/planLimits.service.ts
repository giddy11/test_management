// modules/subscription/services/planLimits.service.ts
// The plan's limits, enforced: how much an organisation is using, and refusing
// an addition that would take it past what its plan includes.
//
// What happens at a limit: nothing is deleted or hidden. Adding more (a
// person, a project, test cases, a client company, an upload, AI credits) is
// refused with a clear message until the organisation upgrades or removes
// something. The one exception is the activity log, where older entries drop
// out of view (they are kept, and come back on a plan with longer history).
//
// The platform owner (wildcard) is never held back by a customer plan.
import { AppDataSource } from "../../../infrastructure/database/dataSource";
import { SubscriptionService, type EffectivePlan } from "./subscription.service";
import { LIMITS, type LimitKey } from "../domain/planCatalog";

const { AppError } = require("../../../shared/errors/AppError");
const { hasWildcard } = require("../../../shared/access/can");

type Query = (sql: string, params?: unknown[]) => Promise<any[]>;
type Actor = { id?: string; organizationId?: string | null; permissions?: Set<string> | string[] } | null | undefined;

/** The limits that are counted. Activity history is a time window, not a count. */
export type CountedLimit = Exclude<LimitKey, "activity_log_days">;

export type Usage = Record<CountedLimit, number>;

const GB = 1024 ** 3;

// A full seat is someone on the organisation's own team (not a client
// company's supporter) holding any role other than plain Employee. Employees
// who only submit and approve IT requests never need a seat.
const FREE_ROLE_KEYS = ["employee"];

const NOUNS: Record<CountedLimit, [string, string]> = {
  full_seats: ["full seat", "full seats"],
  projects: ["project", "projects"],
  test_cases: ["test case", "test cases"],
  client_companies: ["client company", "client companies"],
  storage_gb: ["GB of attachment storage", "GB of attachment storage"],
  ai_credits_monthly: ["AI credit a month", "AI credits a month"],
};

const ADVICE: Record<CountedLimit, string> = {
  full_seats: "Upgrade your plan, buy extra seats, or change someone to the Employee role.",
  projects: "Upgrade your plan or delete a project you no longer need.",
  test_cases: "Upgrade your plan or delete test cases you no longer need.",
  client_companies: "Upgrade your plan or remove a client company.",
  storage_gb: "Upgrade your plan or delete attachments you no longer need.",
  ai_credits_monthly: "Upgrade your plan, wait for next month, or have people use their own AI key.",
};

function fmt(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function isPlatformOwner(actor: Actor): boolean {
  return !!actor && hasWildcard(actor);
}

export class PlanLimitsService {
  static Instance = new PlanLimitsService();

  private readonly query: Query;

  constructor(
    private readonly plans: Pick<SubscriptionService, "current"> = SubscriptionService.Instance,
    query?: Query
  ) {
    this.query = query ?? ((sql, params) => AppDataSource.query(sql, params));
    this.hasDatabase = query ? () => true : () => AppDataSource.isInitialized;
  }

  // Unit tests build services without a database; the limits then stand
  // aside, as they would have before this existed. The running app always has one.
  private readonly hasDatabase: () => boolean;

  // ── Counting ────────────────────────────────────────────────────────────────
  async count(organizationId: string, key: CountedLimit): Promise<number> {
    switch (key) {
      case "full_seats":
        return this.one(
          `SELECT COUNT(DISTINCT u."id")::int AS n
             FROM "users" u
             JOIN "user_roles" ur ON ur."user_id" = u."id"
             JOIN "roles" r ON r."id" = ur."role_id"
            WHERE u."organization_id" = $1 AND u."deleted_at" IS NULL AND u."client_company_id" IS NULL
              AND (r."key" IS NULL OR r."key" <> ALL($2::varchar[]))`,
          [organizationId, FREE_ROLE_KEYS]
        );
      case "projects":
        return this.one(
          `SELECT COUNT(*)::int AS n FROM "projects" WHERE "organization_id" = $1 AND "deleted_at" IS NULL`,
          [organizationId]
        );
      case "test_cases":
        return this.one(
          `SELECT COUNT(*)::int AS n
             FROM "test_cases" tc
             JOIN "test_suites" s ON s."id" = tc."suite_id"
             JOIN "projects" p ON p."id" = s."project_id"
            WHERE p."organization_id" = $1
              AND tc."deleted_at" IS NULL AND s."deleted_at" IS NULL AND p."deleted_at" IS NULL`,
          [organizationId]
        );
      case "client_companies":
        return this.one(
          `SELECT COUNT(*)::int AS n
             FROM "client_companies" cc
             JOIN "projects" p ON p."id" = cc."project_id"
            WHERE p."organization_id" = $1 AND cc."deleted_at" IS NULL AND p."deleted_at" IS NULL`,
          [organizationId]
        );
      case "storage_gb":
        // Bytes, from every attachment the organisation's people uploaded.
        // Deleting an attachment removes its row, so this is what's stored now.
        return this.one(
          `SELECT COALESCE(SUM(a."bytes"), 0)::bigint AS n FROM (
             SELECT x."file_size_bytes" AS "bytes", x."uploaded_by_id" AS "by" FROM "test_case_attachments" x
             UNION ALL SELECT x."file_size_bytes", x."uploaded_by_id" FROM "bug_attachments" x
             UNION ALL SELECT x."file_size_bytes", x."uploaded_by_id" FROM "feature_request_attachments" x
             UNION ALL SELECT x."file_size_bytes", x."uploaded_by_id" FROM "service_request_attachments" x
           ) a
           JOIN "users" u ON u."id" = a."by"
           WHERE u."organization_id" = $1`,
          [organizationId]
        );
      case "ai_credits_monthly":
        // Credits given out (granted) since the start of this calendar month.
        return this.one(
          `SELECT COALESCE(SUM("amount"), 0)::int AS n
             FROM "ai_credit_transactions"
            WHERE "organization_id" = $1 AND "type" = 'grant' AND "amount" > 0
              AND "created_at" >= date_trunc('month', now())`,
          [organizationId]
        );
    }
  }

  /** Everything counted, for the organisation's Plan page. Storage in GB. */
  async usage(organizationId: string): Promise<Usage> {
    const keys = LIMITS.map((l) => l.key).filter((k): k is CountedLimit => k !== "activity_log_days");
    const values = await Promise.all(keys.map((k) => this.count(organizationId, k)));
    const usage = Object.fromEntries(keys.map((k, i) => [k, values[i]])) as Usage;
    usage.storage_gb = Math.round((usage.storage_gb / GB) * 100) / 100;
    return usage;
  }

  // ── Enforcing ───────────────────────────────────────────────────────────────
  /**
   * Refuses adding `adding` more of something when that would go past the plan.
   * Storage takes bytes; everything else takes a count.
   */
  async assertCanAdd(actor: Actor, organizationId: string | null | undefined, key: CountedLimit, adding = 1): Promise<void> {
    if (!organizationId || adding <= 0 || isPlatformOwner(actor) || !this.hasDatabase()) return;
    const plan = await this.plans.current(organizationId);
    const max = plan.limits[key];
    if (max === null) return; // unlimited

    const raw = await this.count(organizationId, key);
    if (key === "storage_gb") {
      if (raw + adding <= max * GB) return;
      throw this.refusal(plan, key, Math.round((raw / GB) * 100) / 100, max, Math.round((adding / GB) * 100) / 100);
    }
    if (raw + adding <= max) return;
    throw this.refusal(plan, key, raw, max, adding);
  }

  /**
   * Seats are taken by role, so they are checked where roles are given: someone
   * who goes from no role (or Employee only) to any other role takes a seat.
   * Client-company supporters never take one.
   */
  async assertSeatForRoles(
    actor: Actor,
    organizationId: string | null | undefined,
    userId: string | null,
    before: Array<{ key?: string | null }>,
    after: Array<{ key?: string | null }>
  ): Promise<void> {
    const takesSeat = (roles: Array<{ key?: string | null }>) =>
      roles.some((r) => !r.key || !FREE_ROLE_KEYS.includes(r.key));
    if (!takesSeat(after) || takesSeat(before) || !this.hasDatabase()) return;
    if (userId) {
      const [row] = await this.query(`SELECT "client_company_id" FROM "users" WHERE "id" = $1`, [userId]);
      if (row?.client_company_id) return;
    }
    await this.assertCanAdd(actor, organizationId, "full_seats", 1);
  }

  /** The oldest activity the plan lets the organisation see, or null for all of it. */
  async activitySince(organizationId: string | null | undefined): Promise<Date | null> {
    if (!organizationId || !this.hasDatabase()) return null;
    const days = (await this.plans.current(organizationId)).limits.activity_log_days;
    if (days === null) return null;
    return new Date(Date.now() - days * 86_400_000);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  private async one(sql: string, params: unknown[]): Promise<number> {
    const [row] = await this.query(sql, params);
    return Number(row?.n ?? 0);
  }

  private refusal(plan: EffectivePlan, key: CountedLimit, used: number, max: number, adding: number) {
    const [one, many] = NOUNS[key];
    const noun = (n: number) => (n === 1 ? one : many);
    let message: string;
    if (key === "ai_credits_monthly") {
      message =
        max === 0
          ? `Your ${plan.planName} plan doesn't include AI credits to give out. People can still use AI with their own key.`
          : `Your ${plan.planName} plan includes ${fmt(max)} ${noun(max)}, and ${fmt(used)} have been given out this month. You can give up to ${fmt(Math.max(0, max - used))} more until next month.`;
    } else if (key === "storage_gb") {
      message = `Your ${plan.planName} plan includes ${fmt(max)} ${noun(max)}, and ${fmt(used)} GB is used. This upload (${fmt(adding)} GB) won't fit.`;
    } else {
      message =
        adding > 1
          ? `Your ${plan.planName} plan includes ${fmt(max)} ${noun(max)}. Your organisation has ${fmt(used)}, so adding ${fmt(adding)} more would go over.`
          : `Your ${plan.planName} plan includes ${fmt(max)} ${noun(max)}, and your organisation has ${fmt(used)}.`;
    }
    return new AppError(`${message} ${ADVICE[key]}`, 403, [], {
      reason: "plan_limit",
      limit: key,
      planKey: plan.planKey,
      used,
      max,
    });
  }
}
