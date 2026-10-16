// modules/ai/repositories/aiUsage.repository.ts
// Append-only usage log: counts, never content. Also the aggregates behind the
// AI usage report (response times, failures, adoption) — all over indexed
// (organization_id, created_at).
import type { Repository } from "typeorm";
import { AiUsageLog } from "../entities/aiUsageLog.entity";
import { AppDataSource } from "../../../infrastructure/database/dataSource";

export type NewAiUsage = Omit<AiUsageLog, "id" | "createdAt" | "user" | "project">;

export interface UsageByFeatureRow {
  feature: string;
  requests: number;
  succeeded: number;
  failed: number;
  avgMs: number | null;
  p95Ms: number | null;
  inputTokens: number;
  outputTokens: number;
  people: number;
}

export interface UsageByDayRow {
  day: string; // YYYY-MM-DD
  requests: number;
  failed: number;
}

export interface UsageErrorRow {
  errorKind: string;
  count: number;
}

export interface UsageTotals {
  requests: number;
  failed: number;
  people: number;
  ownKeyRequests: number;
  teamSize: number;
}

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const numOrNull = (v: unknown) => (v === null || v === undefined ? null : Math.round(Number(v)));

export class AiUsageRepository {
  static Instance = new AiUsageRepository();

  private repo: Repository<AiUsageLog>;

  constructor() {
    this.repo = AppDataSource.getRepository(AiUsageLog);
  }

  async create(entry: NewAiUsage): Promise<void> {
    await this.repo.insert(entry);
  }

  async byFeature(organizationId: string, since: Date): Promise<UsageByFeatureRow[]> {
    const rows = await AppDataSource.query(
      `SELECT "feature",
              COUNT(*)::int AS "requests",
              COUNT(*) FILTER (WHERE "status" = 'ok')::int AS "succeeded",
              COUNT(*) FILTER (WHERE "status" = 'error')::int AS "failed",
              AVG("duration_ms") FILTER (WHERE "status" = 'ok') AS "avgMs",
              PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "duration_ms") FILTER (WHERE "status" = 'ok') AS "p95Ms",
              COALESCE(SUM("input_tokens"), 0)::bigint AS "inputTokens",
              COALESCE(SUM("output_tokens"), 0)::bigint AS "outputTokens",
              COUNT(DISTINCT "user_id")::int AS "people"
         FROM "ai_usage_logs"
        WHERE "organization_id" = $1 AND "created_at" >= $2
        GROUP BY "feature"
        ORDER BY "requests" DESC`,
      [organizationId, since]
    );
    return rows.map((r: Record<string, unknown>) => ({
      feature: String(r.feature),
      requests: num(r.requests),
      succeeded: num(r.succeeded),
      failed: num(r.failed),
      avgMs: numOrNull(r.avgMs),
      p95Ms: numOrNull(r.p95Ms),
      inputTokens: num(r.inputTokens),
      outputTokens: num(r.outputTokens),
      people: num(r.people),
    }));
  }

  async byDay(organizationId: string, since: Date): Promise<UsageByDayRow[]> {
    const rows = await AppDataSource.query(
      `SELECT TO_CHAR(DATE_TRUNC('day', "created_at"), 'YYYY-MM-DD') AS "day",
              COUNT(*)::int AS "requests",
              COUNT(*) FILTER (WHERE "status" = 'error')::int AS "failed"
         FROM "ai_usage_logs"
        WHERE "organization_id" = $1 AND "created_at" >= $2
        GROUP BY 1
        ORDER BY 1`,
      [organizationId, since]
    );
    return rows.map((r: Record<string, unknown>) => ({ day: String(r.day), requests: num(r.requests), failed: num(r.failed) }));
  }

  async errors(organizationId: string, since: Date): Promise<UsageErrorRow[]> {
    const rows = await AppDataSource.query(
      `SELECT COALESCE("error_kind", 'unknown') AS "errorKind", COUNT(*)::int AS "count"
         FROM "ai_usage_logs"
        WHERE "organization_id" = $1 AND "created_at" >= $2 AND "status" = 'error'
        GROUP BY 1
        ORDER BY 2 DESC`,
      [organizationId, since]
    );
    return rows.map((r: Record<string, unknown>) => ({ errorKind: String(r.errorKind), count: num(r.count) }));
  }

  async totals(organizationId: string, since: Date): Promise<UsageTotals> {
    const [usage, team] = await Promise.all([
      AppDataSource.query(
        `SELECT COUNT(*)::int AS "requests",
                COUNT(*) FILTER (WHERE "status" = 'error')::int AS "failed",
                COUNT(DISTINCT "user_id")::int AS "people",
                COUNT(*) FILTER (WHERE "key_source" = 'user')::int AS "ownKeyRequests"
           FROM "ai_usage_logs"
          WHERE "organization_id" = $1 AND "created_at" >= $2`,
        [organizationId, since]
      ),
      // Adoption is measured against the product team (external supporters
      // never use AI drafting).
      AppDataSource.query(
        `SELECT COUNT(*)::int AS "n" FROM "users"
          WHERE "organization_id" = $1 AND "deleted_at" IS NULL AND "client_company_id" IS NULL`,
        [organizationId]
      ),
    ]);
    return {
      requests: num(usage[0]?.requests),
      failed: num(usage[0]?.failed),
      people: num(usage[0]?.people),
      ownKeyRequests: num(usage[0]?.ownKeyRequests),
      teamSize: num(team[0]?.n),
    };
  }
}
