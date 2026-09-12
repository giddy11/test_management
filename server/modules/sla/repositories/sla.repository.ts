// modules/sla/repositories/sla.repository.ts
// SLA analytics over feedback tickets. Every query here is built on ONE
// shared CTE chain (see buildBase) so a KPI card, its chart, and its
// drill-down list always agree — they're the same filtered ticket set with
// the same SLA maths applied.
//
// Per ticket the chain derives:
//   first_response_ms  created → first_response_at  (null until responded)
//   resolution_ms      created → resolved_at, minus paused time (null until resolved)
//   paused_ms          time spent in any configured "paused" stage, on either
//                      tier's timeline, clipped at resolution
//   fr_breached /      measured span (or the live age, for open tickets)
//   res_breached       exceeds the severity's target
//   compliance         'met' (resolved, nothing breached) | 'breached' | 'pending'
//   stage              the ticket's current stage on whichever tier owns it
import type { Repository } from "typeorm";
import { SlaSettings, type SlaTargets } from "../entities/slaSettings.entity";
import { AppDataSource } from "../../../infrastructure/database/dataSource";

const { buildMeta, getOffset } = require("../../../shared/pagination/paginate");
const { parseReferenceCode } = require("../../../shared/utils/referenceCode");

// Who the caller is allowed to see — resolved by the service from the actor.
export interface SlaScope {
  organizationId?: string | null;
  // Plain users: only projects they're a member of.
  memberUserId?: string;
  // IT supporters: only their own company's tickets.
  clientCompanyId?: string;
}

export interface SlaQueryFilters {
  from?: string;
  to?: string;
  projectId?: string;
  clientCompanyId?: string;
  status?: string;
  severity?: string;
  type?: string;
  assigneeId?: string;
  supporterId?: string;
  search?: string;
}

export interface SlaRules {
  targets: SlaTargets;
  pausedStatuses: string[];
}

type Built = { sql: string; params: unknown[] };

// Every SQL predicate that narrows the ticket set lives here — the service
// never composes SQL.
function buildBase(scope: SlaScope, filters: SlaQueryFilters, rules: SlaRules): Built {
  const params: unknown[] = [JSON.stringify(rules.targets), rules.pausedStatuses];
  const where: string[] = ["fb.deleted_at IS NULL", "p.deleted_at IS NULL"];
  const add = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (scope.clientCompanyId) {
    where.push(`fb.client_company_id = ${add(scope.clientCompanyId)}`);
  } else {
    if (scope.organizationId) where.push(`p.organization_id = ${add(scope.organizationId)}`);
    if (scope.memberUserId) {
      where.push(
        `EXISTS (SELECT 1 FROM project_members spm WHERE spm.project_id = p.id AND spm.user_id = ${add(scope.memberUserId)})`
      );
    }
  }

  // Date range is on ticket creation (inclusive calendar days, DB timezone).
  if (filters.from) where.push(`fb.created_at >= ${add(filters.from)}::date`);
  if (filters.to) where.push(`fb.created_at < (${add(filters.to)}::date + interval '1 day')`);
  if (filters.projectId) where.push(`fb.project_id = ${add(filters.projectId)}`);
  if (filters.clientCompanyId) where.push(`fb.client_company_id = ${add(filters.clientCompanyId)}`);
  if (filters.type) where.push(`fb.type = ${add(filters.type)}`);
  if (filters.severity) {
    where.push(
      filters.severity === "unset" ? `fb.severity IS NULL` : `fb.severity = ${add(filters.severity)}`
    );
  }
  if (filters.assigneeId) {
    where.push(
      `EXISTS (SELECT 1 FROM feedback_assignees ffa WHERE ffa.feedback_id = fb.id AND ffa.user_id = ${add(filters.assigneeId)})`
    );
  }
  if (filters.supporterId) where.push(`fb.assigned_supporter_id = ${add(filters.supporterId)}`);
  if (filters.search) {
    const ticketNumber = parseReferenceCode("TKT", filters.search);
    if (ticketNumber != null) {
      where.push(`fb.ticket_number = ${add(ticketNumber)}`);
    } else {
      const like = add(`%${filters.search}%`);
      where.push(`(fb.title ILIKE ${like} OR fb.submitter_email ILIKE ${like})`);
    }
  }

  // The stage filter applies to the derived column, so it goes on the outer
  // select rather than the raw WHERE.
  const stageFilter = filters.status ? `WHERE stage = ${add(filters.status)}` : "";

  const sql = `
    WITH cfg AS (
      SELECT $1::jsonb AS targets, $2::text[] AS paused
    ),
    base AS (
      SELECT fb.id, fb.ticket_number, fb.title, fb.type, fb.status, fb.support_status, fb.severity,
        fb.project_id, p.name AS project_name, fb.client_company_id, cc.name AS client_company_name,
        fb.assigned_supporter_id, fb.submitter_name, fb.submitter_email, fb.suite_name, fb.rating,
        fb.created_at, fb.first_response_at, fb.resolved_at, fb.closed_at, fb.status_updated_at,
        fb.escalated_at,
        COALESCE(fb.severity, 'default') AS sev_key,
        -- A company ticket still in (or resolved by) its IT queue is at the
        -- IT tier's stage; everything else follows the product lifecycle.
        CASE WHEN fb.client_company_id IS NOT NULL AND fb.support_status IS DISTINCT FROM 'escalated'
             THEN fb.support_status ELSE fb.status END AS stage
      FROM feedback fb
      JOIN projects p ON p.id = fb.project_id
      LEFT JOIN client_companies cc ON cc.id = fb.client_company_id
      WHERE ${where.join(" AND ")}
    ),
    -- Time each ticket spent in a paused stage on EITHER timeline, clipped
    -- at resolution (paused time after resolving can't affect anything).
    paused AS (
      SELECT h.feedback_id,
        SUM(GREATEST(0, EXTRACT(EPOCH FROM (
          LEAST(COALESCE(h.next_at, now()), COALESCE(b.resolved_at, now())) - h.entered_at
        ))) * 1000)::bigint AS paused_ms
      FROM (
        SELECT feedback_id, status, entered_at,
          LEAD(entered_at) OVER (PARTITION BY feedback_id ORDER BY entered_at, status) AS next_at
        FROM (
          SELECT feedback_id, status, entered_at FROM feedback_status_history
          UNION ALL
          SELECT feedback_id, status, entered_at FROM feedback_support_status_history
        ) hh
      ) h
      JOIN base b ON b.id = h.feedback_id
      CROSS JOIN cfg
      WHERE h.status = ANY(cfg.paused)
      GROUP BY h.feedback_id
    ),
    measured AS (
      SELECT b.*,
        COALESCE(pz.paused_ms, 0)::bigint AS paused_ms,
        ROUND((cfg.targets -> b.sev_key ->> 'firstResponseHours')::numeric * 3600000)::bigint AS fr_target_ms,
        ROUND((cfg.targets -> b.sev_key ->> 'resolutionHours')::numeric * 3600000)::bigint AS res_target_ms,
        CASE WHEN b.first_response_at IS NOT NULL
             THEN (EXTRACT(EPOCH FROM (b.first_response_at - b.created_at)) * 1000)::bigint END AS first_response_ms,
        CASE WHEN b.resolved_at IS NOT NULL
             THEN GREATEST(0, (EXTRACT(EPOCH FROM (b.resolved_at - b.created_at)) * 1000)::bigint - COALESCE(pz.paused_ms, 0)) END AS resolution_ms,
        (EXTRACT(EPOCH FROM (now() - b.created_at)) * 1000)::bigint AS age_ms,
        (EXTRACT(EPOCH FROM (now() - COALESCE(b.status_updated_at, b.escalated_at, b.created_at))) * 1000)::bigint AS since_update_ms
      FROM base b
      CROSS JOIN cfg
      LEFT JOIN paused pz ON pz.feedback_id = b.id
    ),
    sla AS (
      SELECT m.*,
        (m.resolved_at IS NOT NULL) AS is_resolved,
        -- Open tickets are judged on their live clock, so a breach shows up
        -- the moment the target passes — no batch job needed.
        CASE WHEN m.first_response_ms IS NOT NULL THEN m.first_response_ms > m.fr_target_ms
             ELSE m.age_ms > m.fr_target_ms END AS fr_breached,
        CASE WHEN m.resolution_ms IS NOT NULL THEN m.resolution_ms > m.res_target_ms
             ELSE (m.age_ms - m.paused_ms) > m.res_target_ms END AS res_breached,
        m.created_at + (m.fr_target_ms * interval '1 millisecond') AS fr_due_at,
        m.created_at + ((m.res_target_ms + m.paused_ms) * interval '1 millisecond') AS res_due_at
      FROM measured m
    ),
    t AS (
      SELECT s.*,
        CASE WHEN s.fr_breached OR s.res_breached THEN 'breached'
             WHEN s.is_resolved THEN 'met'
             ELSE 'pending' END AS compliance
      FROM sla s
      ${stageFilter}
    )
  `;
  return { sql, params };
}

const METRIC_PREDICATES: Record<string, string> = {
  all: "TRUE",
  open: "NOT t.is_resolved",
  resolved: "t.is_resolved",
  closed: "t.closed_at IS NOT NULL",
  breached: "t.compliance = 'breached'",
  compliant: "t.compliance = 'met'",
  pending: "t.compliance = 'pending'",
  awaiting_response: "t.first_response_at IS NULL AND NOT t.is_resolved",
  first_response_breached: "t.fr_breached",
  resolution_breached: "t.res_breached",
};

const SORTS: Record<string, string> = {
  newest: "t.created_at DESC",
  oldest: "t.created_at ASC",
  longest_waiting: "t.is_resolved ASC, t.age_ms DESC",
};

export class SlaRepository {
  static Instance = new SlaRepository();

  private ds = AppDataSource;
  private settingsRepo: Repository<SlaSettings>;

  constructor() {
    this.settingsRepo = AppDataSource.getRepository(SlaSettings);
  }

  // ── Settings ────────────────────────────────────────────────────────────────

  async findSettings(organizationId: string): Promise<SlaSettings | null> {
    return this.settingsRepo.findOne({ where: { organizationId } });
  }

  async saveSettings(data: Omit<SlaSettings, "updatedAt">): Promise<SlaSettings> {
    return this.settingsRepo.save(data);
  }

  // ── Analytics ───────────────────────────────────────────────────────────────

  async kpis(scope: SlaScope, filters: SlaQueryFilters, rules: SlaRules) {
    const { sql, params } = buildBase(scope, filters, rules);
    const [row] = await this.ds.query(
      `${sql}
       SELECT count(*)::int AS total,
         count(*) FILTER (WHERE type = 'bug')::int AS bugs,
         count(*) FILTER (WHERE type = 'feature_request')::int AS "featureRequests",
         count(*) FILTER (WHERE type = 'complaint')::int AS complaints,
         count(*) FILTER (WHERE is_resolved)::int AS resolved,
         count(*) FILTER (WHERE closed_at IS NOT NULL)::int AS closed,
         count(*) FILTER (WHERE NOT is_resolved)::int AS open,
         count(*) FILTER (WHERE first_response_at IS NULL AND NOT is_resolved)::int AS "awaitingResponse",
         count(*) FILTER (WHERE first_response_at IS NOT NULL)::int AS responded,
         avg(first_response_ms)::bigint AS "avgFirstResponseMs",
         (percentile_cont(0.5) WITHIN GROUP (ORDER BY first_response_ms))::bigint AS "medianFirstResponseMs",
         avg(resolution_ms)::bigint AS "avgResolutionMs",
         (percentile_cont(0.5) WITHIN GROUP (ORDER BY resolution_ms))::bigint AS "medianResolutionMs",
         count(*) FILTER (WHERE first_response_ms IS NOT NULL AND NOT fr_breached)::int AS "firstResponseMet",
         count(*) FILTER (WHERE fr_breached)::int AS "firstResponseBreached",
         count(*) FILTER (WHERE is_resolved AND NOT res_breached)::int AS "resolutionMet",
         count(*) FILTER (WHERE res_breached)::int AS "resolutionBreached",
         count(*) FILTER (WHERE compliance = 'met')::int AS "slaMet",
         count(*) FILTER (WHERE compliance = 'breached')::int AS "slaBreached",
         count(*) FILTER (WHERE compliance = 'pending')::int AS "slaPending",
         (avg(age_ms) FILTER (WHERE NOT is_resolved))::bigint AS "avgWaitingMs",
         (max(age_ms) FILTER (WHERE NOT is_resolved))::bigint AS "oldestWaitingMs",
         (sum(paused_ms))::bigint AS "totalPausedMs",
         avg(rating)::float AS "avgRating",
         count(rating)::int AS "ratingCount"
       FROM t`,
      params
    );
    return row;
  }

  // Tickets created per period (by type) plus resolutions per period, for the
  // trend chart. Both series are over the same filtered set, so "resolved"
  // counts resolutions of tickets created in range, bucketed by when they
  // were resolved.
  async overTime(scope: SlaScope, filters: SlaQueryFilters, rules: SlaRules, interval: string) {
    const { sql, params } = buildBase(scope, filters, rules);
    params.push(interval);
    const iv = `$${params.length}`;
    return this.ds.query(
      `${sql}
       SELECT to_char(period, 'YYYY-MM-DD') AS period,
         sum(bugs)::int AS bugs,
         sum(feature_requests)::int AS "featureRequests",
         sum(complaints)::int AS complaints,
         sum(created)::int AS total,
         sum(resolved)::int AS resolved,
         sum(breached)::int AS breached
       FROM (
         SELECT date_trunc(${iv}, created_at) AS period,
           (type = 'bug')::int AS bugs,
           (type = 'feature_request')::int AS feature_requests,
           (type = 'complaint')::int AS complaints,
           1 AS created, 0 AS resolved,
           (compliance = 'breached')::int AS breached
         FROM t
         UNION ALL
         SELECT date_trunc(${iv}, resolved_at), 0, 0, 0, 0, 1, 0 FROM t WHERE resolved_at IS NOT NULL
       ) x
       GROUP BY period ORDER BY period`,
      params
    );
  }

  async bySeverity(scope: SlaScope, filters: SlaQueryFilters, rules: SlaRules) {
    const { sql, params } = buildBase(scope, filters, rules);
    return this.ds.query(
      `${sql}
       SELECT COALESCE(severity, 'unset') AS severity,
         count(*)::int AS total,
         count(*) FILTER (WHERE NOT is_resolved)::int AS open,
         count(*) FILTER (WHERE is_resolved)::int AS resolved,
         count(*) FILTER (WHERE compliance = 'met')::int AS met,
         count(*) FILTER (WHERE compliance = 'breached')::int AS breached,
         count(*) FILTER (WHERE compliance = 'pending')::int AS pending,
         avg(first_response_ms)::bigint AS "avgFirstResponseMs",
         avg(resolution_ms)::bigint AS "avgResolutionMs",
         min(fr_target_ms)::bigint AS "firstResponseTargetMs",
         min(res_target_ms)::bigint AS "resolutionTargetMs"
       FROM t
       GROUP BY COALESCE(severity, 'unset')`,
      params
    );
  }

  async byStage(scope: SlaScope, filters: SlaQueryFilters, rules: SlaRules) {
    const { sql, params } = buildBase(scope, filters, rules);
    return this.ds.query(
      `${sql}
       SELECT stage AS status, count(*)::int AS count,
         count(*) FILTER (WHERE compliance = 'breached')::int AS breached
       FROM t GROUP BY stage ORDER BY count DESC`,
      params
    );
  }

  async byType(scope: SlaScope, filters: SlaQueryFilters, rules: SlaRules) {
    const { sql, params } = buildBase(scope, filters, rules);
    return this.ds.query(
      `${sql}
       SELECT type, count(*)::int AS total,
         count(*) FILTER (WHERE is_resolved)::int AS resolved,
         count(*) FILTER (WHERE compliance = 'breached')::int AS breached,
         avg(resolution_ms)::bigint AS "avgResolutionMs"
       FROM t GROUP BY type ORDER BY total DESC`,
      params
    );
  }

  async byProject(scope: SlaScope, filters: SlaQueryFilters, rules: SlaRules) {
    const { sql, params } = buildBase(scope, filters, rules);
    return this.ds.query(
      `${sql}
       SELECT project_id AS "projectId", project_name AS "projectName",
         count(*)::int AS total,
         count(*) FILTER (WHERE NOT is_resolved)::int AS open,
         count(*) FILTER (WHERE is_resolved)::int AS resolved,
         count(*) FILTER (WHERE compliance = 'met')::int AS met,
         count(*) FILTER (WHERE compliance = 'breached')::int AS breached,
         avg(first_response_ms)::bigint AS "avgFirstResponseMs",
         avg(resolution_ms)::bigint AS "avgResolutionMs"
       FROM t GROUP BY project_id, project_name ORDER BY total DESC`,
      params
    );
  }

  // Product-team members, via the many-to-many assignee table — a ticket
  // with two assignees counts once for each of them.
  async byAssignee(scope: SlaScope, filters: SlaQueryFilters, rules: SlaRules, limit = 15) {
    const { sql, params } = buildBase(scope, filters, rules);
    params.push(limit);
    return this.ds.query(
      `${sql}
       SELECT u.id AS "userId",
         trim(concat(u.first_name, ' ', u.last_name)) AS name,
         count(*)::int AS total,
         count(*) FILTER (WHERE NOT t.is_resolved)::int AS open,
         count(*) FILTER (WHERE t.is_resolved)::int AS resolved,
         count(*) FILTER (WHERE t.compliance = 'met')::int AS met,
         count(*) FILTER (WHERE t.compliance = 'breached')::int AS breached,
         avg(t.first_response_ms)::bigint AS "avgFirstResponseMs",
         avg(t.resolution_ms)::bigint AS "avgResolutionMs"
       FROM t
       JOIN feedback_assignees fa ON fa.feedback_id = t.id
       JOIN users u ON u.id = fa.user_id
       GROUP BY u.id, u.first_name, u.last_name
       ORDER BY total DESC, breached ASC
       LIMIT $${params.length}`,
      params
    );
  }

  // IT support engineers (assigned_supporter_id).
  async bySupporter(scope: SlaScope, filters: SlaQueryFilters, rules: SlaRules, limit = 15) {
    const { sql, params } = buildBase(scope, filters, rules);
    params.push(limit);
    return this.ds.query(
      `${sql}
       SELECT u.id AS "userId",
         trim(concat(u.first_name, ' ', u.last_name)) AS name,
         t.client_company_name AS "clientCompanyName",
         count(*)::int AS total,
         count(*) FILTER (WHERE NOT t.is_resolved)::int AS open,
         count(*) FILTER (WHERE t.is_resolved)::int AS resolved,
         count(*) FILTER (WHERE t.compliance = 'met')::int AS met,
         count(*) FILTER (WHERE t.compliance = 'breached')::int AS breached,
         avg(t.first_response_ms)::bigint AS "avgFirstResponseMs",
         avg(t.resolution_ms)::bigint AS "avgResolutionMs"
       FROM t
       JOIN users u ON u.id = t.assigned_supporter_id
       GROUP BY u.id, u.first_name, u.last_name, t.client_company_name
       ORDER BY total DESC, breached ASC
       LIMIT $${params.length}`,
      params
    );
  }

  // Recurring issues: the same title (case/whitespace-insensitive) reported
  // more than once for the same project and type.
  async recurring(scope: SlaScope, filters: SlaQueryFilters, rules: SlaRules, limit = 10) {
    const { sql, params } = buildBase(scope, filters, rules);
    params.push(limit);
    return this.ds.query(
      `${sql}
       SELECT min(title) AS title, type,
         project_id AS "projectId", project_name AS "projectName",
         count(*)::int AS count,
         count(*) FILTER (WHERE NOT is_resolved)::int AS open,
         count(*) FILTER (WHERE compliance = 'breached')::int AS breached,
         max(created_at) AS "lastSeenAt",
         min(created_at) AS "firstSeenAt"
       FROM t
       GROUP BY lower(regexp_replace(trim(title), '\\s+', ' ', 'g')), type, project_id, project_name
       HAVING count(*) >= 2
       ORDER BY count DESC, "lastSeenAt" DESC
       LIMIT $${params.length}`,
      params
    );
  }

  // Drill-down: the actual tickets behind a figure, with their SLA readings.
  async tickets(
    scope: SlaScope,
    filters: SlaQueryFilters,
    rules: SlaRules,
    { metric = "all", sort = "newest", page = 1, limit = 20 }: { metric?: string; sort?: string; page?: number; limit?: number }
  ) {
    const { sql, params } = buildBase(scope, filters, rules);
    const predicate = METRIC_PREDICATES[metric] ?? "TRUE";
    const order = SORTS[sort] ?? SORTS.newest;

    let total = 0;
    if (page === 1) {
      const [row] = await this.ds.query(`${sql} SELECT count(*)::int AS n FROM t WHERE ${predicate}`, params);
      total = row.n;
    }

    const dataParams = [...params, limit, getOffset(page, limit)];
    const data = await this.ds.query(
      `${sql}
       SELECT t.id, t.ticket_number AS "ticketNumber", t.title, t.type, t.status, t.support_status AS "supportStatus",
         t.stage, t.severity, t.project_id AS "projectId", t.project_name AS "projectName",
         t.client_company_id AS "clientCompanyId", t.client_company_name AS "clientCompanyName",
         t.submitter_name AS "submitterName", t.suite_name AS "suiteName", t.rating,
         t.created_at AS "createdAt", t.first_response_at AS "firstResponseAt",
         t.resolved_at AS "resolvedAt", t.closed_at AS "closedAt",
         t.first_response_ms AS "firstResponseMs", t.resolution_ms AS "resolutionMs",
         t.paused_ms AS "pausedMs", t.age_ms AS "ageMs", t.since_update_ms AS "sinceUpdateMs",
         t.fr_target_ms AS "firstResponseTargetMs", t.res_target_ms AS "resolutionTargetMs",
         t.fr_due_at AS "firstResponseDueAt", t.res_due_at AS "resolutionDueAt",
         t.fr_breached AS "firstResponseBreached", t.res_breached AS "resolutionBreached",
         t.compliance, t.is_resolved AS "isResolved",
         (SELECT array_agg(trim(concat(au.first_name, ' ', au.last_name)) ORDER BY au.first_name)
            FROM feedback_assignees afa JOIN users au ON au.id = afa.user_id
            WHERE afa.feedback_id = t.id) AS assignees,
         trim(concat(su.first_name, ' ', su.last_name)) AS "supporterName"
       FROM t
       LEFT JOIN users su ON su.id = t.assigned_supporter_id
       WHERE ${predicate}
       ORDER BY ${order}
       LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams
    );

    return { data, meta: buildMeta(page, limit, total, data.length) };
  }

  // Filter options. Projects/companies come from the tickets the caller can
  // see; people come from the users table directly so every team member and
  // support engineer is selectable, not only those who already hold a ticket.
  async filterOptions(scope: SlaScope, rules: SlaRules) {
    const { sql, params } = buildBase(scope, {}, rules);
    const people = (where: string, whereParams: unknown[]) =>
      this.ds.query(
        `SELECT u.id, trim(concat(u.first_name, ' ', u.last_name)) AS name
         FROM users u WHERE u.deleted_at IS NULL AND ${where} ORDER BY name`,
        whereParams
      );

    // Product-team members: the org's internal (non-supporter) accounts. A
    // supporter's dashboard has no team-member filter (see SlaDashboard).
    const assigneesQuery = scope.clientCompanyId
      ? Promise.resolve([])
      : people(`u.organization_id = $1 AND u.role IN ('superadmin', 'admin', 'user')`, [scope.organizationId]);
    // Support engineers: the supporter's own company, or every supporter
    // across the org's client companies.
    const supportersQuery = scope.clientCompanyId
      ? people(`u.client_company_id = $1 AND u.role = 'it_support'`, [scope.clientCompanyId])
      : people(`u.organization_id = $1 AND u.role = 'it_support'`, [scope.organizationId]);

    const [projects, companies, assignees, supporters] = await Promise.all([
      this.ds.query(
        `${sql} SELECT DISTINCT project_id AS id, project_name AS name FROM t ORDER BY name`,
        params
      ),
      this.ds.query(
        `${sql} SELECT DISTINCT client_company_id AS id, client_company_name AS name
         FROM t WHERE client_company_id IS NOT NULL ORDER BY name`,
        params
      ),
      assigneesQuery,
      supportersQuery,
    ]);
    return { projects, companies, assignees, supporters };
  }
}
