// modules/sla/repositories/slaEscalation.repository.ts
// Data access for the SLA escalation sweeper: which open issues are past a
// target and due a new escalation level, who is holding each one up, and the
// record of what was already sent.
//
// "Past a target" is read through the dashboard's own query chain (buildBase),
// so the sweeper and the SLA dashboard can never disagree about what has
// breached — including paused stages and per-source targets.
import type { EntityManager } from "typeorm";
import { AppDataSource } from "../../../infrastructure/database/dataSource";
import { buildBase, type SlaRules, type SlaSource } from "./sla.repository";
import type { SlaEscalationMetric } from "../entities/slaEscalation.entity";

const { ActivityLog } = require("../../activity/entities/activityLog.entity");

export interface OverdueIssue {
  id: string;
  source: SlaSource;
  referenceNumber: number;
  title: string;
  projectId: string;
  projectName: string;
  clientCompanyId: string | null;
  supportStatus: string | null;
  assignedSupporterId: string | null;
  createdAt: string;
  metric: SlaEscalationMetric;
  dueAt: string;
  targetMs: number;
  // The level the issue should be at now, and the highest one already sent.
  level: 1 | 2 | 3;
  sentLevel: number;
}

export interface SlaPerson {
  id: string;
  name: string;
  email: string;
  firstName: string;
  // A client company's IT supporter: opens tickets in /support, not the projects.
  external: boolean;
}

const PERSON_COLUMNS = `u."id", TRIM(CONCAT(u."first_name", ' ', u."last_name")) AS "name", u."email",
  u."first_name" AS "firstName", (u."client_company_id" IS NOT NULL) AS "external"`;

export class SlaEscalationRepository {
  static Instance = new SlaEscalationRepository();

  // Organisations that have escalation switched on (and so have a start date).
  async enabledOrganizationIds(): Promise<string[]> {
    const rows: { id: string }[] = await AppDataSource.query(
      `SELECT "organization_id" AS "id" FROM "sla_settings"
        WHERE ("escalation" ->> 'enabled')::boolean = true AND "escalation_since" IS NOT NULL`
    );
    return rows.map((r) => r.id);
  }

  // Open issues past a first-response or resolution target whose level is
  // higher than the last one sent. The level is the same rule as
  // escalationLevelAt (serviceDesk/domain/serviceLevels.ts), done in SQL so the
  // batch only ever holds issues with something new to send:
  //   level 1  at the due time
  //   level 2  at due + level2Pct% of the target
  //   level 3  at due + level3Pct% of the target
  async overdue(
    organizationId: string,
    rules: SlaRules,
    since: Date,
    pct: { level2Pct: number; level3Pct: number },
    limit: number
  ): Promise<OverdueIssue[]> {
    const { sql, params } = buildBase({ organizationId }, {}, rules);
    const add = (v: unknown) => {
      params.push(v);
      return `$${params.length}`;
    };
    const l2 = add(pct.level2Pct);
    const l3 = add(pct.level3Pct);
    const from = add(since);
    const max = add(limit);

    const rows: OverdueIssue[] = await AppDataSource.query(
      `${sql},
       due AS (
         SELECT t.id, t.source, t.reference_number, t.title, t.project_id, t.project_name, t.client_company_id,
                t.support_status, t.assigned_supporter_id, t.created_at,
                'first_response'::varchar AS metric, t.fr_due_at AS due_at, t.fr_target_ms AS target_ms
           FROM t WHERE t.first_response_at IS NULL AND NOT t.is_resolved
         UNION ALL
         SELECT t.id, t.source, t.reference_number, t.title, t.project_id, t.project_name, t.client_company_id,
                t.support_status, t.assigned_supporter_id, t.created_at,
                'resolution', t.res_due_at, t.res_target_ms
           FROM t WHERE NOT t.is_resolved
       ),
       late AS (
         SELECT d.*,
           CASE WHEN now() - d.due_at >= (d.target_ms::numeric * ${l3}::numeric / 100) * interval '1 millisecond' THEN 3
                WHEN now() - d.due_at >= (d.target_ms::numeric * ${l2}::numeric / 100) * interval '1 millisecond' THEN 2
                ELSE 1 END AS level
           FROM due d
          WHERE d.due_at < now() AND d.created_at >= ${from}::timestamptz
       )
       SELECT l.id, l.source, l.reference_number AS "referenceNumber", l.title, l.project_id AS "projectId",
              l.project_name AS "projectName", l.client_company_id AS "clientCompanyId",
              l.support_status AS "supportStatus", l.assigned_supporter_id AS "assignedSupporterId",
              l.created_at AS "createdAt", l.metric, l.due_at AS "dueAt", l.target_ms AS "targetMs",
              l.level, COALESCE(sent.level, 0)::int AS "sentLevel"
         FROM late l
         LEFT JOIN LATERAL (
           SELECT max(e.level) AS level FROM "sla_escalations" e WHERE e.issue_id = l.id AND e.metric = l.metric
         ) sent ON true
        WHERE l.level > COALESCE(sent.level, 0)
        ORDER BY l.due_at ASC
        LIMIT ${max}`,
      params
    );
    return rows.map((r) => ({ ...r, targetMs: Number(r.targetMs), level: Number(r.level) as 1 | 2 | 3 }));
  }

  // Who is holding the issue up: a ticket's assignees (or, while it is still in
  // its client company's IT queue, the supporter it is routed to — everyone in
  // that queue when nobody has picked it up), a bug's assignee. Feature
  // requests have no assignee.
  async holdersOf(issue: OverdueIssue): Promise<SlaPerson[]> {
    if (issue.source === "bug") {
      return this.people(
        `SELECT ${PERSON_COLUMNS} FROM "bugs" b JOIN "users" u ON u."id" = b."assigned_to_id"
          WHERE b."id" = $1 AND u."deleted_at" IS NULL`,
        [issue.id]
      );
    }
    if (issue.source !== "ticket") return [];

    const inItQueue = Boolean(issue.clientCompanyId) && issue.supportStatus !== "escalated";
    if (!inItQueue) {
      return this.people(
        `SELECT ${PERSON_COLUMNS} FROM "feedback_assignees" fa JOIN "users" u ON u."id" = fa."user_id"
          WHERE fa."feedback_id" = $1 AND u."deleted_at" IS NULL`,
        [issue.id]
      );
    }
    if (issue.assignedSupporterId) {
      return this.people(`SELECT ${PERSON_COLUMNS} FROM "users" u WHERE u."id" = $1 AND u."deleted_at" IS NULL`, [
        issue.assignedSupporterId,
      ]);
    }
    return this.people(
      `SELECT ${PERSON_COLUMNS} FROM "users" u
        WHERE u."client_company_id" = $1 AND u."role" = 'it_support' AND u."deleted_at" IS NULL`,
      [issue.clientCompanyId]
    );
  }

  private people(sql: string, params: unknown[]): Promise<SlaPerson[]> {
    return AppDataSource.query(sql, params);
  }

  // Records the escalation — only if nobody else got there first. Returns
  // false when this level was already sent for this issue and target.
  async record(
    m: EntityManager,
    organizationId: string,
    issue: OverdueIssue,
    level: number,
    notifiedUserIds: string[],
    audit: Record<string, unknown>
  ): Promise<boolean> {
    const inserted = await m.query(
      `INSERT INTO "sla_escalations" ("organization_id", "source", "issue_id", "metric", "level", "notified_user_ids")
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT ON CONSTRAINT "uq_sla_escalations_once" DO NOTHING
       RETURNING "id"`,
      [organizationId, issue.source, issue.id, issue.metric, level, notifiedUserIds]
    );
    if (!inserted.length) return false;
    await m.insert(ActivityLog, audit);
    return true;
  }

  run<T>(work: (m: EntityManager) => Promise<T>): Promise<T> {
    return AppDataSource.transaction(work);
  }
}
