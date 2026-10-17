// modules/serviceDesk/repositories/automation.repository.ts
// Automation rules, webhook connectors, and the run log. Organisation first,
// always — a callback is the one exception, found by its run id and proven by
// its one-time token.
import type { EntityManager } from "typeorm";
import { AppDataSource } from "../../../infrastructure/database/dataSource";
import { ServiceAutomationRule } from "../entities/serviceAutomationRule.entity";
import { ServiceAutomationRun, type RunKind, type RunStatus } from "../entities/serviceAutomationRun.entity";
import { ServiceWebhookEndpoint } from "../entities/serviceWebhookEndpoint.entity";

const { ActivityLog } = require("../../activity/entities/activityLog.entity");
const { getOffset, buildMetaFromTotal } = require("../../../shared/pagination/paginate");

export interface RunRow {
  id: string;
  requestId: string;
  requestNumber: number;
  requestTitle: string;
  kind: RunKind;
  status: RunStatus;
  ruleName: string | null;
  endpointName: string | null;
  attempt: number;
  nextAttemptAt: Date | null;
  detail: Record<string, unknown> | null;
  error: string | null;
  initiatedByName: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}

const name = (alias: string) => `COALESCE(NULLIF(TRIM(CONCAT(${alias}."first_name", ' ', ${alias}."last_name")), ''), ${alias}."email")`;

const RUN_SELECT = `
  ru."id", ru."request_id" AS "requestId", sr."request_number" AS "requestNumber", sr."title" AS "requestTitle",
  ru."kind", ru."status", ru."rule_name" AS "ruleName", we."name" AS "endpointName", ru."attempt",
  ru."next_attempt_at" AS "nextAttemptAt", ru."detail", ru."error",
  CASE WHEN u."id" IS NOT NULL THEN ${name("u")} END AS "initiatedByName",
  ru."started_at" AS "startedAt", ru."finished_at" AS "finishedAt"
  FROM "service_automation_runs" ru
  JOIN "service_requests" sr ON sr."id" = ru."request_id"
  LEFT JOIN "service_webhook_endpoints" we ON we."id" = ru."endpoint_id"
  LEFT JOIN "users" u ON u."id" = ru."initiated_by_id"`;

export class AutomationRepository {
  static Instance = new AutomationRepository();

  // ── Rules ──────────────────────────────────────────────────────────────────
  async listRules(organizationId: string, activeOnly = false): Promise<ServiceAutomationRule[]> {
    return AppDataSource.getRepository(ServiceAutomationRule).find({
      where: activeOnly ? { organizationId, isActive: true } : { organizationId },
      order: { sortOrder: "ASC", name: "ASC" },
    });
  }

  async findRule(organizationId: string, id: string): Promise<ServiceAutomationRule | null> {
    return AppDataSource.getRepository(ServiceAutomationRule).findOne({ where: { organizationId, id } });
  }

  async saveRule(
    organizationId: string,
    id: string | null,
    fields: Partial<ServiceAutomationRule>,
    audit: Record<string, unknown>
  ): Promise<ServiceAutomationRule> {
    return AppDataSource.transaction(async (m: EntityManager) => {
      const repo = m.getRepository(ServiceAutomationRule);
      let saved: ServiceAutomationRule;
      if (id) {
        await repo.update({ organizationId, id }, fields as never);
        saved = await repo.findOneOrFail({ where: { organizationId, id } });
      } else {
        saved = await repo.save(repo.create({ organizationId, ...fields }));
      }
      await m.insert(ActivityLog, { ...audit, entityId: saved.id });
      return saved;
    });
  }

  async deleteRule(organizationId: string, id: string, audit: Record<string, unknown>): Promise<void> {
    await AppDataSource.transaction(async (m: EntityManager) => {
      await m.getRepository(ServiceAutomationRule).delete({ organizationId, id });
      await m.insert(ActivityLog, audit);
    });
  }

  // ── Connectors ─────────────────────────────────────────────────────────────
  async listEndpoints(organizationId: string): Promise<(ServiceWebhookEndpoint & { itemCount: number })[]> {
    const endpoints = await AppDataSource.getRepository(ServiceWebhookEndpoint).find({
      where: { organizationId },
      order: { name: "ASC" },
    });
    const counts: { endpointId: string; n: number }[] = await AppDataSource.query(
      `SELECT "fulfilment_config"->>'endpointId' AS "endpointId", COUNT(*)::int AS "n"
         FROM "service_catalog_items"
        WHERE "organization_id" = $1 AND "fulfilment_type" = 'webhook'
        GROUP BY 1`,
      [organizationId]
    );
    const byId = new Map(counts.map((c) => [c.endpointId, c.n]));
    return endpoints.map((e) => ({ ...e, itemCount: byId.get(e.id) ?? 0 }));
  }

  async findEndpoint(organizationId: string, id: string): Promise<ServiceWebhookEndpoint | null> {
    return AppDataSource.getRepository(ServiceWebhookEndpoint).findOne({ where: { organizationId, id } });
  }

  async endpointNameTaken(organizationId: string, endpointName: string, exceptId?: string): Promise<boolean> {
    const rows = await AppDataSource.query(
      `SELECT 1 FROM "service_webhook_endpoints" WHERE "organization_id" = $1 AND LOWER("name") = LOWER($2) AND ($3::uuid IS NULL OR "id" <> $3)`,
      [organizationId, endpointName, exceptId ?? null]
    );
    return rows.length > 0;
  }

  async saveEndpoint(
    organizationId: string,
    id: string | null,
    fields: Partial<ServiceWebhookEndpoint>,
    audit: Record<string, unknown>
  ): Promise<ServiceWebhookEndpoint> {
    return AppDataSource.transaction(async (m: EntityManager) => {
      const repo = m.getRepository(ServiceWebhookEndpoint);
      let saved: ServiceWebhookEndpoint;
      if (id) {
        await repo.update({ organizationId, id }, fields as never);
        saved = await repo.findOneOrFail({ where: { organizationId, id } });
      } else {
        saved = await repo.save(repo.create({ organizationId, ...fields }));
      }
      await m.insert(ActivityLog, { ...audit, entityId: saved.id });
      return saved;
    });
  }

  async deleteEndpoint(organizationId: string, id: string, audit: Record<string, unknown>): Promise<void> {
    await AppDataSource.transaction(async (m: EntityManager) => {
      await m.getRepository(ServiceWebhookEndpoint).delete({ organizationId, id });
      await m.insert(ActivityLog, audit);
    });
  }

  async noteEndpointResult(id: string, ok: boolean, failure?: string): Promise<void> {
    await AppDataSource.query(
      ok
        ? `UPDATE "service_webhook_endpoints" SET "last_success_at" = now() WHERE "id" = $1`
        : `UPDATE "service_webhook_endpoints" SET "last_failure_at" = now(), "last_failure" = $2 WHERE "id" = $1`,
      ok ? [id] : [id, (failure ?? "").slice(0, 300)]
    );
  }

  // ── Runs ───────────────────────────────────────────────────────────────────
  async addRun(row: Partial<ServiceAutomationRun>, m?: EntityManager): Promise<ServiceAutomationRun> {
    const repo = (m ?? AppDataSource.manager).getRepository(ServiceAutomationRun);
    return repo.save(repo.create(row));
  }

  async findRun(id: string): Promise<ServiceAutomationRun | null> {
    return AppDataSource.getRepository(ServiceAutomationRun).findOne({ where: { id } });
  }

  async lockRun(m: EntityManager, id: string): Promise<ServiceAutomationRun | null> {
    return m.getRepository(ServiceAutomationRun).findOne({ where: { id }, lock: { mode: "pessimistic_write" } });
  }

  async updateRun(id: string, patch: Partial<ServiceAutomationRun>, m?: EntityManager): Promise<void> {
    await (m ?? AppDataSource.manager).getRepository(ServiceAutomationRun).update({ id }, patch as never);
  }

  // Webhook runs still in flight for a request — at most one, in practice.
  async openWebhookRuns(requestId: string, m?: EntityManager): Promise<ServiceAutomationRun[]> {
    return (m ?? AppDataSource.manager).getRepository(ServiceAutomationRun).find({
      where: [
        { requestId, kind: "webhook", status: "pending" },
        { requestId, kind: "webhook", status: "retrying" },
      ],
    });
  }

  async runsForRequest(requestId: string): Promise<RunRow[]> {
    return AppDataSource.query(`SELECT ${RUN_SELECT} WHERE ru."request_id" = $1 ORDER BY ru."started_at" ASC`, [requestId]);
  }

  async listRuns(
    organizationId: string,
    f: { status?: RunStatus; kind?: RunKind; page: number; limit: number }
  ): Promise<{ data: RunRow[]; meta: unknown }> {
    const params: unknown[] = [organizationId];
    const where = [`ru."organization_id" = $1`];
    if (f.status) {
      params.push(f.status);
      where.push(`ru."status" = $${params.length}`);
    }
    if (f.kind) {
      params.push(f.kind);
      where.push(`ru."kind" = $${params.length}`);
    }
    params.push(f.limit, getOffset(f.page, f.limit));
    const rows = await AppDataSource.query(
      `SELECT ${RUN_SELECT.replace(`ru."id",`, `ru."id", COUNT(*) OVER() AS "totalCount",`)}
        WHERE ${where.join(" AND ")}
        ORDER BY ru."started_at" DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const total = rows.length ? Number(rows[0].totalCount) : 0;
    return { data: rows, meta: buildMetaFromTotal(f.page, f.limit, total) };
  }

  // For the sweeper: deliveries due a retry, and accepted deliveries whose
  // callback never came. Across every organisation.
  async dueRetries(limit: number): Promise<ServiceAutomationRun[]> {
    return AppDataSource.getRepository(ServiceAutomationRun)
      .createQueryBuilder("ru")
      .where(`ru.status = 'retrying' AND ru.next_attempt_at <= now()`)
      .orderBy("ru.next_attempt_at", "ASC")
      .limit(limit)
      .getMany();
  }

  async staleCallbacks(olderThanHours: number, limit: number): Promise<ServiceAutomationRun[]> {
    return AppDataSource.getRepository(ServiceAutomationRun)
      .createQueryBuilder("ru")
      .where(`ru.status = 'pending' AND ru.started_at < now() - make_interval(hours => :h)`, { h: olderThanHours })
      .limit(limit)
      .getMany();
  }

  // Automation in the reporting period, and what needs a person right now.
  async report(organizationId: string, from: Date, to: Date) {
    const [runs] = await AppDataSource.query(
      `SELECT COUNT(*) FILTER (WHERE "kind" = 'rule')::int AS "rulesApplied",
              COUNT(*) FILTER (WHERE "kind" = 'auto_approve' AND "status" = 'succeeded')::int AS "autoApproved",
              COUNT(*) FILTER (WHERE "kind" = 'auto_approve' AND "status" = 'skipped')::int AS "autoApprovalRefused",
              COUNT(*) FILTER (WHERE "kind" = 'webhook' AND "status" = 'succeeded')::int AS "webhookSucceeded",
              COUNT(*) FILTER (WHERE "kind" = 'webhook' AND "status" = 'failed')::int AS "webhookFailed",
              COUNT(*) FILTER (WHERE "kind" = 'webhook' AND "status" IN ('pending', 'retrying'))::int AS "webhookInFlight",
              COUNT(*) FILTER (WHERE "kind" = 'deflect')::int AS "selfService",
              COUNT(*) FILTER (WHERE "kind" = 'ai_triage')::int AS "aiTriage"
         FROM "service_automation_runs"
        WHERE "organization_id" = $1 AND "started_at" >= $2 AND "started_at" < $3`,
      [organizationId, from, to]
    );
    const [now] = await AppDataSource.query(
      `SELECT COUNT(*) FILTER (WHERE "needs_review")::int AS "needsReview",
              COUNT(*) FILTER (WHERE "automation_status" = 'failed' AND "status" NOT IN ('fulfilled', 'cancelled', 'rejected'))::int AS "automationFailed"
         FROM "service_requests" WHERE "organization_id" = $1`,
      [organizationId]
    );
    const [fulfilled] = await AppDataSource.query(
      `SELECT COUNT(*) FILTER (WHERE "fulfilled_by" = 'automation')::int AS "byAutomation",
              COUNT(*) FILTER (WHERE "fulfilled_by" = 'self_service')::int AS "bySelfService",
              COUNT(*) FILTER (WHERE "fulfilled_by" = 'person' OR "fulfilled_by" IS NULL)::int AS "byPerson"
         FROM "service_requests"
        WHERE "organization_id" = $1 AND "fulfilled_at" >= $2 AND "fulfilled_at" < $3`,
      [organizationId, from, to]
    );
    return { runs, now, fulfilled };
  }
}
