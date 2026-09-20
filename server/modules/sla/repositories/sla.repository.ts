// modules/sla/repositories/sla.repository.ts
// SLA analytics over three issue sources — feedback tickets, bugs, and
// feature requests. Every query here is built on ONE shared CTE chain (see
// buildBase) so a KPI card, its chart, and its drill-down list always agree
// — they're the same filtered issue set with the same SLA maths applied.
//
// `base` is a UNION ALL of three normalized sub-selects (one per source),
// each producing the same column shape (nulls where a source has no
// equivalent — e.g. bugs/feature requests have no client company). Every
// CTE after `base` is generic over that shape and doesn't care which table
// a row came from.
//
// Per issue the chain derives:
//   first_response_ms  created → first_response_at  (null until responded)
//   resolution_ms      created → resolved_at, minus paused time (null until resolved)
//   paused_ms          time spent in any configured "paused" stage, on
//                      whichever status-history table the source uses
//   fr_breached /      measured span (or the live age, for open issues)
//   res_breached       exceeds the severity's target
//   compliance         'met' (resolved, nothing breached) | 'breached' | 'pending'
//   stage              the issue's current stage (dual-tier for tickets,
//                      plain status for bugs/feature requests)
import type { Repository } from "typeorm";
import { SlaSettings, type SlaTargets } from "../entities/slaSettings.entity";
import { AppDataSource } from "../../../infrastructure/database/dataSource";

const { buildMeta, getOffset } = require("../../../shared/pagination/paginate");
const { parseReferenceCode, formatReferenceCode } = require("../../../shared/utils/referenceCode");

// Who the caller is allowed to see — resolved by the service from the actor.
export interface SlaScope {
  organizationId?: string | null;
  // Plain users: only projects they're a member of.
  memberUserId?: string;
  // IT supporters: only their own company's tickets. Bugs/feature requests
  // have no client-company concept, so a supporter's scope only ever
  // includes the ticket branch (see buildBase).
  clientCompanyId?: string;
}

export type SlaSource = "ticket" | "bug" | "feature_request";

export interface SlaQueryFilters {
  from?: string;
  to?: string;
  projectId?: string;
  clientCompanyId?: string;
  status?: string;
  severity?: string;
  type?: string;
  source?: SlaSource;
  assigneeId?: string;
  supporterId?: string;
  search?: string;
}

export interface SlaRules {
  targets: SlaTargets;
  pausedStatuses: string[];
}

type Built = { sql: string; params: unknown[] };

const REFERENCE_PREFIX: Record<SlaSource, string> = {
  ticket: "TKT",
  bug: "BF",
  feature_request: "FR",
};

// Bug.priority (Low/Medium/High/Urgent) → the low/medium/high/critical scale
// SLA targets are keyed by. Bugs always carry a priority, so this always
// resolves — unlike feedback's severity, a bug is never "unset".
const BUG_PRIORITY_SEVERITY_CASE = `
  CASE b.priority
    WHEN 'Low' THEN 'low'
    WHEN 'Medium' THEN 'medium'
    WHEN 'High' THEN 'high'
    WHEN 'Urgent' THEN 'critical'
  END`;

// Every SQL predicate that narrows the issue set lives here — the service
// never composes SQL. Builds a UNION ALL of up to three normalized
// sub-selects (ticket/bug/feature_request), skipping a branch entirely when
// a filter makes it structurally impossible to match (e.g. a ticket-only
// `type` filter, or an IT-support scope that bugs/feature requests have no
// concept of) rather than filtering it out after the fact.
function buildBase(scope: SlaScope, filters: SlaQueryFilters, rules: SlaRules): Built {
  const params: unknown[] = [JSON.stringify(rules.targets), rules.pausedStatuses];
  const add = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };

  const wantSource = filters.source;
  const includeTicket = !wantSource || wantSource === "ticket";
  // `type` (feedback's bug/feature_request/complaint sub-category) and
  // `supporterId` are concepts that only exist on the ticket/IT-tier model —
  // bugs and feature requests have no matching column, so a query using
  // either filter can only ever mean tickets.
  const ticketOnlyFilterActive = Boolean(filters.type || filters.supporterId);
  const includeBug =
    (!wantSource || wantSource === "bug") && !scope.clientCompanyId && !ticketOnlyFilterActive;
  const includeFeatureRequest =
    (!wantSource || wantSource === "feature_request") &&
    !scope.clientCompanyId &&
    !ticketOnlyFilterActive &&
    // Feature requests have no assignee concept.
    !filters.assigneeId;

  const branches: string[] = [];

  if (includeTicket) {
    const where: string[] = ["fb.deleted_at IS NULL", "p.deleted_at IS NULL"];
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
    if (filters.from) where.push(`fb.created_at >= ${add(filters.from)}::date`);
    if (filters.to) where.push(`fb.created_at < (${add(filters.to)}::date + interval '1 day')`);
    if (filters.projectId) where.push(`fb.project_id = ${add(filters.projectId)}`);
    if (filters.clientCompanyId) where.push(`fb.client_company_id = ${add(filters.clientCompanyId)}`);
    if (filters.type) where.push(`fb.type = ${add(filters.type)}`);
    if (filters.severity) {
      where.push(filters.severity === "unset" ? `fb.severity IS NULL` : `fb.severity = ${add(filters.severity)}`);
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

    branches.push(`
      SELECT fb.id, 'ticket'::varchar(20) AS source, fb.ticket_number AS reference_number, fb.title, fb.type,
        fb.status, fb.support_status, fb.severity,
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
    `);
  }

  if (includeBug) {
    const where: string[] = ["b.deleted_at IS NULL", "p.deleted_at IS NULL"];
    if (scope.organizationId) where.push(`p.organization_id = ${add(scope.organizationId)}`);
    if (scope.memberUserId) {
      where.push(
        `EXISTS (SELECT 1 FROM project_members spm WHERE spm.project_id = p.id AND spm.user_id = ${add(scope.memberUserId)})`
      );
    }
    if (filters.from) where.push(`b.created_at >= ${add(filters.from)}::date`);
    if (filters.to) where.push(`b.created_at < (${add(filters.to)}::date + interval '1 day')`);
    if (filters.projectId) where.push(`b.project_id = ${add(filters.projectId)}`);
    if (filters.severity) {
      where.push(
        filters.severity === "unset"
          ? `(${BUG_PRIORITY_SEVERITY_CASE}) IS NULL`
          : `(${BUG_PRIORITY_SEVERITY_CASE}) = ${add(filters.severity)}`
      );
    }
    if (filters.assigneeId) where.push(`b.assigned_to_id = ${add(filters.assigneeId)}`);
    if (filters.search) {
      const bugNumber = parseReferenceCode("BF", filters.search);
      if (bugNumber != null) {
        where.push(`b.bug_number = ${add(bugNumber)}`);
      } else {
        where.push(`b.title ILIKE ${add(`%${filters.search}%`)}`);
      }
    }

    branches.push(`
      SELECT b.id, 'bug'::varchar(20) AS source, b.bug_number AS reference_number, b.title, NULL::varchar(30) AS type,
        b.status::varchar(30) AS status, NULL::varchar(30) AS support_status, (${BUG_PRIORITY_SEVERITY_CASE})::varchar(20) AS severity,
        b.project_id, p.name AS project_name, NULL::uuid AS client_company_id, NULL::varchar AS client_company_name,
        NULL::uuid AS assigned_supporter_id,
        trim(concat(ru.first_name, ' ', ru.last_name)) AS submitter_name, NULL::varchar(255) AS submitter_email,
        NULL::varchar(200) AS suite_name, NULL::smallint AS rating,
        b.created_at, b.first_response_at, b.resolved_at, b.closed_at, b.status_updated_at,
        NULL::timestamptz AS escalated_at,
        COALESCE((${BUG_PRIORITY_SEVERITY_CASE})::varchar(20), 'default') AS sev_key,
        b.status::varchar(30) AS stage
      FROM bugs b
      JOIN projects p ON p.id = b.project_id
      LEFT JOIN users ru ON ru.id = b.reported_by_id
      WHERE ${where.join(" AND ")}
    `);
  }

  if (includeFeatureRequest) {
    const where: string[] = ["fr.deleted_at IS NULL", "p.deleted_at IS NULL"];
    if (scope.organizationId) where.push(`p.organization_id = ${add(scope.organizationId)}`);
    if (scope.memberUserId) {
      where.push(
        `EXISTS (SELECT 1 FROM project_members spm WHERE spm.project_id = p.id AND spm.user_id = ${add(scope.memberUserId)})`
      );
    }
    if (filters.from) where.push(`fr.created_at >= ${add(filters.from)}::date`);
    if (filters.to) where.push(`fr.created_at < (${add(filters.to)}::date + interval '1 day')`);
    if (filters.projectId) where.push(`fr.project_id = ${add(filters.projectId)}`);
    // Feature requests carry no severity/priority — they always fall to the
    // default target, so only the "unset" filter can ever match.
    if (filters.severity && filters.severity !== "unset") {
      where.push("FALSE");
    }
    if (filters.search) {
      const requestNumber = parseReferenceCode("FR", filters.search);
      if (requestNumber != null) {
        where.push(`fr.request_number = ${add(requestNumber)}`);
      } else {
        where.push(`fr.title ILIKE ${add(`%${filters.search}%`)}`);
      }
    }

    branches.push(`
      SELECT fr.id, 'feature_request'::varchar(20) AS source, fr.request_number AS reference_number, fr.title,
        NULL::varchar(30) AS type,
        fr.status::varchar(30) AS status, NULL::varchar(30) AS support_status, NULL::varchar(20) AS severity,
        fr.project_id, p.name AS project_name, NULL::uuid AS client_company_id, NULL::varchar AS client_company_name,
        NULL::uuid AS assigned_supporter_id,
        trim(concat(su.first_name, ' ', su.last_name)) AS submitter_name, NULL::varchar(255) AS submitter_email,
        NULL::varchar(200) AS suite_name, NULL::smallint AS rating,
        fr.created_at, fr.first_response_at, fr.resolved_at, fr.closed_at, fr.status_updated_at,
        NULL::timestamptz AS escalated_at,
        'default'::varchar(20) AS sev_key,
        fr.status::varchar(30) AS stage
      FROM feature_requests fr
      JOIN projects p ON p.id = fr.project_id
      LEFT JOIN users su ON su.id = fr.submitted_by_id
      WHERE ${where.join(" AND ")}
    `);
  }

  // No branch survived the filters (e.g. source=bug for a supporter scope) —
  // an always-empty base keeps every downstream CTE well-formed.
  const unionedBase =
    branches.length > 0
      ? branches.join(" UNION ALL ")
      : `SELECT NULL::uuid AS id, NULL::varchar AS source, NULL::int AS reference_number, NULL::varchar AS title,
           NULL::varchar(30) AS type, NULL::varchar AS status, NULL::varchar(30) AS support_status,
           NULL::varchar(20) AS severity, NULL::uuid AS project_id, NULL::varchar AS project_name,
           NULL::uuid AS client_company_id, NULL::varchar AS client_company_name, NULL::uuid AS assigned_supporter_id,
           NULL::varchar AS submitter_name, NULL::varchar(255) AS submitter_email, NULL::varchar(200) AS suite_name,
           NULL::smallint AS rating, now() AS created_at, NULL::timestamptz AS first_response_at,
           NULL::timestamptz AS resolved_at, NULL::timestamptz AS closed_at, NULL::timestamptz AS status_updated_at,
           NULL::timestamptz AS escalated_at, 'default' AS sev_key, NULL::varchar AS stage
         WHERE FALSE`;

  // The stage filter applies to the derived column, so it goes on the outer
  // select rather than the raw WHERE.
  const stageFilter = filters.status ? `WHERE stage = ${add(filters.status)}` : "";

  const sql = `
    WITH cfg AS (
      SELECT $1::jsonb AS targets, $2::text[] AS paused
    ),
    base AS (
      ${unionedBase}
    ),
    -- Time each issue spent in a paused stage on whichever status-history
    -- table its source uses, clipped at resolution (paused time after
    -- resolving can't affect anything).
    paused AS (
      SELECT h.issue_id,
        SUM(GREATEST(0, EXTRACT(EPOCH FROM (
          LEAST(COALESCE(h.next_at, now()), COALESCE(b.resolved_at, now())) - h.entered_at
        ))) * 1000)::bigint AS paused_ms
      FROM (
        SELECT issue_id, status, entered_at,
          LEAD(entered_at) OVER (PARTITION BY issue_id ORDER BY entered_at, status) AS next_at
        FROM (
          SELECT feedback_id AS issue_id, status, entered_at FROM feedback_status_history
          UNION ALL
          SELECT feedback_id, status, entered_at FROM feedback_support_status_history
          UNION ALL
          SELECT bug_id, status, entered_at FROM bug_status_history
          UNION ALL
          SELECT feature_request_id, status, entered_at FROM feature_request_status_history
        ) hh
      ) h
      JOIN base b ON b.id = h.issue_id
      CROSS JOIN cfg
      WHERE h.status = ANY(cfg.paused)
      GROUP BY h.issue_id
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
      LEFT JOIN paused pz ON pz.issue_id = b.id
    ),
    sla AS (
      SELECT m.*,
        (m.resolved_at IS NOT NULL) AS is_resolved,
        -- Open issues are judged on their live clock, so a breach shows up
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
    ),
    -- Normalized (issue_id, user_id) pairs across every source that has an
    -- assignee concept — tickets (many-to-many) and bugs (single column).
    -- Feature requests have none, so they never appear here.
    issue_assignees AS (
      SELECT feedback_id AS issue_id, user_id FROM feedback_assignees
      UNION ALL
      SELECT id, assigned_to_id FROM bugs WHERE assigned_to_id IS NOT NULL
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
         count(*) FILTER (WHERE source = 'ticket')::int AS tickets,
         count(*) FILTER (WHERE source = 'bug')::int AS bugs,
         count(*) FILTER (WHERE source = 'feature_request')::int AS "featureRequests",
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

  // Issues created per period (by source) plus resolutions per period, for
  // the trend chart. Both series are over the same filtered set, so
  // "resolved" counts resolutions of issues created in range, bucketed by
  // when they were resolved.
  async overTime(scope: SlaScope, filters: SlaQueryFilters, rules: SlaRules, interval: string) {
    const { sql, params } = buildBase(scope, filters, rules);
    params.push(interval);
    const iv = `$${params.length}`;
    return this.ds.query(
      `${sql}
       SELECT to_char(period, 'YYYY-MM-DD') AS period,
         sum(tickets)::int AS tickets,
         sum(bugs)::int AS bugs,
         sum(feature_requests)::int AS "featureRequests",
         sum(created)::int AS total,
         sum(resolved)::int AS resolved,
         sum(breached)::int AS breached
       FROM (
         SELECT date_trunc(${iv}, created_at) AS period,
           (source = 'ticket')::int AS tickets,
           (source = 'bug')::int AS bugs,
           (source = 'feature_request')::int AS feature_requests,
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

  // Feedback's own bug/feature_request/complaint sub-category — only ever
  // meaningful for ticket-sourced rows.
  async byType(scope: SlaScope, filters: SlaQueryFilters, rules: SlaRules) {
    const { sql, params } = buildBase(scope, filters, rules);
    return this.ds.query(
      `${sql}
       SELECT type, count(*)::int AS total,
         count(*) FILTER (WHERE is_resolved)::int AS resolved,
         count(*) FILTER (WHERE compliance = 'breached')::int AS breached,
         avg(resolution_ms)::bigint AS "avgResolutionMs"
       FROM t WHERE source = 'ticket' GROUP BY type ORDER BY total DESC`,
      params
    );
  }

  // Volume/compliance split by top-level source (ticket/bug/feature_request)
  // — the dimension that answers "does SLA cover bugs and feature requests".
  async bySource(scope: SlaScope, filters: SlaQueryFilters, rules: SlaRules) {
    const { sql, params } = buildBase(scope, filters, rules);
    return this.ds.query(
      `${sql}
       SELECT source, count(*)::int AS total,
         count(*) FILTER (WHERE is_resolved)::int AS resolved,
         count(*) FILTER (WHERE compliance = 'breached')::int AS breached,
         avg(resolution_ms)::bigint AS "avgResolutionMs"
       FROM t GROUP BY source ORDER BY total DESC`,
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

  // Product-team members: tickets via the many-to-many assignee table, bugs
  // via their single assigned_to_id — normalized into issue_assignees so an
  // issue with two ticket-assignees (or one bug-assignee) counts correctly
  // for each. Feature requests have no assignee, so they never appear here.
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
       JOIN issue_assignees ia ON ia.issue_id = t.id
       JOIN users u ON u.id = ia.user_id
       GROUP BY u.id, u.first_name, u.last_name
       ORDER BY total DESC, breached ASC
       LIMIT $${params.length}`,
      params
    );
  }

  // IT support engineers — ticket-only (bugs/feature requests have no
  // supporter concept). Lists every supporter the caller can see, including
  // ones with nothing assigned yet (a company's tickets often sit unassigned
  // in its queue), plus anyone a ticket in range is assigned to. Removed
  // (soft-deleted) accounts are left out even if they still hold tickets.
  async bySupporter(scope: SlaScope, filters: SlaQueryFilters, rules: SlaRules, limit = 15) {
    if (filters.source && filters.source !== "ticket") return [];

    const { sql, params } = buildBase(scope, filters, rules);
    const add = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };

    const rosterWhere = [
      "u.role = 'it_support'",
      "u.deleted_at IS NULL",
      "cc.deleted_at IS NULL",
      "p.deleted_at IS NULL",
    ];
    if (scope.clientCompanyId) {
      rosterWhere.push(`u.client_company_id = ${add(scope.clientCompanyId)}`);
    } else {
      if (scope.organizationId) rosterWhere.push(`p.organization_id = ${add(scope.organizationId)}`);
      if (scope.memberUserId) {
        rosterWhere.push(
          `EXISTS (SELECT 1 FROM project_members spm WHERE spm.project_id = p.id AND spm.user_id = ${add(scope.memberUserId)})`
        );
      }
    }
    if (filters.projectId) rosterWhere.push(`cc.project_id = ${add(filters.projectId)}`);
    if (filters.clientCompanyId) rosterWhere.push(`u.client_company_id = ${add(filters.clientCompanyId)}`);
    if (filters.supporterId) rosterWhere.push(`u.id = ${add(filters.supporterId)}`);

    const limitParam = add(limit);
    return this.ds.query(
      `${sql},
       listed AS (
         SELECT DISTINCT assigned_supporter_id AS user_id FROM t WHERE assigned_supporter_id IS NOT NULL
         UNION
         SELECT u.id FROM users u
           JOIN client_companies cc ON cc.id = u.client_company_id
           JOIN projects p ON p.id = cc.project_id
          WHERE ${rosterWhere.join(" AND ")}
       )
       SELECT u.id AS "userId",
         trim(concat(u.first_name, ' ', u.last_name)) AS name,
         ucc.name AS "clientCompanyName",
         count(t.id)::int AS total,
         count(*) FILTER (WHERE NOT t.is_resolved)::int AS open,
         count(*) FILTER (WHERE t.is_resolved)::int AS resolved,
         count(*) FILTER (WHERE t.compliance = 'met')::int AS met,
         count(*) FILTER (WHERE t.compliance = 'breached')::int AS breached,
         avg(t.first_response_ms)::bigint AS "avgFirstResponseMs",
         avg(t.resolution_ms)::bigint AS "avgResolutionMs"
       FROM listed l
       JOIN users u ON u.id = l.user_id AND u.deleted_at IS NULL
       LEFT JOIN client_companies ucc ON ucc.id = u.client_company_id
       LEFT JOIN t ON t.assigned_supporter_id = u.id
       GROUP BY u.id, u.first_name, u.last_name, ucc.name
       ORDER BY total DESC, breached ASC, name ASC
       LIMIT ${limitParam}`,
      params
    );
  }

  // Recurring issues: the same title (case/whitespace-insensitive) reported
  // more than once for the same project and source (grouping by `source`
  // rather than `type` — the latter is null for every bug/feature-request
  // row, which would otherwise merge unrelated bugs and feature requests
  // that happen to share a title).
  async recurring(scope: SlaScope, filters: SlaQueryFilters, rules: SlaRules, limit = 10) {
    const { sql, params } = buildBase(scope, filters, rules);
    params.push(limit);
    return this.ds.query(
      `${sql}
       SELECT min(title) AS title, source,
         project_id AS "projectId", project_name AS "projectName",
         count(*)::int AS count,
         count(*) FILTER (WHERE NOT is_resolved)::int AS open,
         count(*) FILTER (WHERE compliance = 'breached')::int AS breached,
         max(created_at) AS "lastSeenAt",
         min(created_at) AS "firstSeenAt"
       FROM t
       GROUP BY lower(regexp_replace(trim(title), '\\s+', ' ', 'g')), source, project_id, project_name
       HAVING count(*) >= 2
       ORDER BY count DESC, "lastSeenAt" DESC
       LIMIT $${params.length}`,
      params
    );
  }

  // Drill-down: the actual issues behind a figure, with their SLA readings.
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
       SELECT t.id, t.source, t.reference_number AS "referenceNumber", t.title, t.type, t.status,
         t.support_status AS "supportStatus",
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
            FROM issue_assignees aia JOIN users au ON au.id = aia.user_id
            WHERE aia.issue_id = t.id) AS assignees,
         trim(concat(su.first_name, ' ', su.last_name)) AS "supporterName"
       FROM t
       LEFT JOIN users su ON su.id = t.assigned_supporter_id
       WHERE ${predicate}
       ORDER BY ${order}
       LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams
    );

    for (const row of data) {
      row.referenceCode = formatReferenceCode(REFERENCE_PREFIX[row.source as SlaSource], row.referenceNumber, row.createdAt);
    }

    return { data, meta: buildMeta(page, limit, total, data.length) };
  }

  // Filter options. Projects/companies come from the issues the caller can
  // see; people come from the users table directly so every team member and
  // support engineer is selectable, not only those who already hold an issue.
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
