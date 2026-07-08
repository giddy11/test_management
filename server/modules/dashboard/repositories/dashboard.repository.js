// modules/dashboard/repositories/dashboard.repository.js
// Aggregate analytics, scoped to the requesting user's projects (owner_id),
// optionally narrowed to one project.
const { AppDataSource } = require("../../../infrastructure/database/dataSource");
const { buildMeta, getOffset } = require("../../../shared/pagination/paginate");

class DashboardRepository {
  static Instance = new DashboardRepository();

  constructor() {
    this.ds = AppDataSource;
  }

  // Returns [whereSql, params] applying owner scope (+ optional project filter).
  scope(organizationId, projectId, alias = "p") {
    const params = [organizationId];
    let sql = `${alias}.organization_id = $1 AND ${alias}.deleted_at IS NULL`;
    if (projectId) {
      params.push(projectId);
      sql += ` AND ${alias}.id = $${params.length}`;
    }
    return [sql, params];
  }

  // ── Per-user scoping (role 'user') ──────────────────────────────────────────
  // A plain user's dashboard covers only what relates to them:
  //  - projects they're a member of, or have a case assignment in
  //  - cases assigned to them — or ALL cases of projects they lead
  // Each helper appends $n params and returns a SQL fragment.

  // Project (alias p) is visible to the user: member OR has an assignment in it.
  userProjectScope(params, userId, alias = "p") {
    params.push(userId);
    const u = `$${params.length}`;
    return `(
      EXISTS (SELECT 1 FROM project_members upm WHERE upm.project_id = ${alias}.id AND upm.user_id = ${u})
      OR EXISTS (
        SELECT 1 FROM test_suites uvs
        JOIN test_cases uvc ON uvc.suite_id = uvs.id AND uvc.deleted_at IS NULL
        JOIN test_case_assignees uvt ON uvt.test_case_id = uvc.id
        WHERE uvs.project_id = ${alias}.id AND uvs.deleted_at IS NULL AND uvt.user_id = ${u}
      )
    )`;
  }

  // Case (alias tc, inside project alias p) counts for the user: assigned to
  // them, or anything inside a project they lead.
  userCaseScope(params, userId, caseAlias = "tc", projectAlias = "p") {
    params.push(userId);
    const u = `$${params.length}`;
    return `(
      EXISTS (SELECT 1 FROM test_case_assignees uta WHERE uta.test_case_id = ${caseAlias}.id AND uta.user_id = ${u})
      OR EXISTS (SELECT 1 FROM project_members ulm WHERE ulm.project_id = ${projectAlias}.id AND ulm.user_id = ${u} AND ulm.role = 'team_lead')
    )`;
  }

  async totals(organizationId, projectId, userId) {
    const [pScope, params] = this.scope(organizationId, projectId);
    const projScope = userId ? ` AND ${this.userProjectScope(params, userId)}` : "";
    const [projects] = await this.ds.query(
      `SELECT count(*)::int n FROM projects p WHERE ${pScope}${projScope}`,
      params
    );
    const [suites] = await this.ds.query(
      `SELECT count(*)::int n FROM test_suites ts
       JOIN projects p ON ts.project_id = p.id
       WHERE ${pScope}${projScope} AND ts.deleted_at IS NULL`,
      params
    );

    const caseParams = [...params.slice(0, projectId ? 2 : 1)];
    const caseScope = userId ? ` AND ${this.userCaseScope(caseParams, userId)}` : "";
    const [cases] = await this.ds.query(
      `SELECT count(*)::int n FROM test_cases tc
       JOIN test_suites ts ON tc.suite_id = ts.id
       JOIN projects p ON ts.project_id = p.id
       WHERE ${pScope} AND ts.deleted_at IS NULL AND tc.deleted_at IS NULL${caseScope}`,
      caseParams
    );
    const [runs] = await this.ds.query(
      `SELECT count(*)::int n FROM test_runs r
       JOIN projects p ON r.project_id = p.id
       WHERE ${pScope}${projScope}`,
      params
    );
    return {
      projects: projects.n,
      suites: suites.n,
      cases: cases.n,
      runs: runs.n,
    };
  }

  async caseDistribution(organizationId, projectId, column, userId) {
    const [pScope, params] = this.scope(organizationId, projectId);
    const caseScope = userId ? ` AND ${this.userCaseScope(params, userId)}` : "";
    return this.ds.query(
      `SELECT tc.${column} AS key, count(*)::int AS count FROM test_cases tc
       JOIN test_suites ts ON tc.suite_id = ts.id
       JOIN projects p ON ts.project_id = p.id
       WHERE ${pScope} AND ts.deleted_at IS NULL AND tc.deleted_at IS NULL${caseScope}
       GROUP BY tc.${column} ORDER BY count DESC`,
      params
    );
  }

  async resultBreakdown(organizationId, projectId, userId) {
    const [pScope, params] = this.scope(organizationId, projectId);
    // For a plain user: results on cases assigned to them, or in projects they lead.
    const caseScope = userId
      ? ` AND ${this.userCaseScope(params, userId, "tc")}`
      : "";
    const caseJoin = userId ? `JOIN test_cases tc ON res.test_case_id = tc.id` : "";
    const rows = await this.ds.query(
      `SELECT COALESCE(res.status::text, 'pending') AS key, count(*)::int AS count
       FROM test_run_results res
       JOIN test_runs r ON res.run_id = r.id
       JOIN projects p ON r.project_id = p.id
       ${caseJoin}
       WHERE ${pScope}${caseScope}
       GROUP BY COALESCE(res.status::text, 'pending')`,
      params
    );
    const base = { pass: 0, fail: 0, blocked: 0, skipped: 0, pending: 0, total: 0 };
    for (const row of rows) {
      base[row.key] = row.count;
      base.total += row.count;
    }
    return base;
  }

  async projectsBreakdown(organizationId, projectId, userId) {
    const [pScope, params] = this.scope(organizationId, projectId);
    const projScope = userId ? ` AND ${this.userProjectScope(params, userId)}` : "";
    const caseScope = userId ? ` AND ${this.userCaseScope(params, userId)}` : "";
    return this.ds.query(
      `SELECT p.id, p.name,
        count(DISTINCT ts.id)::int AS "suiteCount",
        count(DISTINCT tc.id)::int AS "caseCount"
       FROM projects p
       LEFT JOIN test_suites ts ON ts.project_id = p.id AND ts.deleted_at IS NULL
       LEFT JOIN test_cases tc ON tc.suite_id = ts.id AND tc.deleted_at IS NULL${caseScope}
       WHERE ${pScope}${projScope}
       GROUP BY p.id, p.name
       ORDER BY p.name`,
      params
    );
  }

  async suitesBreakdown(organizationId, projectId, userId) {
    const [pScope, params] = this.scope(organizationId, projectId);
    const projScope = userId ? ` AND ${this.userProjectScope(params, userId)}` : "";
    const caseScope = userId ? ` AND ${this.userCaseScope(params, userId)}` : "";
    // Use LATERAL to get only the latest result per test case so counts reflect
    // current state, not an inflated aggregate across multiple runs.
    return this.ds.query(
      `SELECT ts.id, ts.name, ts.project_id AS "projectId",
        count(DISTINCT tc.id)::int AS "caseCount",
        count(*) FILTER (WHERE latest.status = 'pass')::int AS pass,
        count(*) FILTER (WHERE latest.status = 'fail')::int AS fail,
        count(*) FILTER (WHERE latest.status = 'blocked')::int AS blocked,
        count(*) FILTER (WHERE latest.status = 'skipped')::int AS skipped,
        count(*) FILTER (WHERE latest.run_id IS NOT NULL AND latest.status IS NULL)::int AS pending
       FROM test_suites ts
       JOIN projects p ON ts.project_id = p.id
       LEFT JOIN test_cases tc ON tc.suite_id = ts.id AND tc.deleted_at IS NULL${caseScope}
       LEFT JOIN LATERAL (
         SELECT run_id, status
         FROM test_run_results
         WHERE test_case_id = tc.id
         ORDER BY executed_at DESC NULLS LAST, id DESC
         LIMIT 1
       ) latest ON true
       WHERE ${pScope}${projScope} AND ts.deleted_at IS NULL
       GROUP BY ts.id, ts.name, ts.project_id
       ORDER BY ts.project_id, ts.name`,
      params
    );
  }

  async topPerformers(organizationId, projectId, limit = 8) {
    const [pScope, params] = this.scope(organizationId, projectId);
    params.push(limit);
    return this.ds.query(
      `SELECT u.id,
        u.first_name AS "firstName",
        u.last_name AS "lastName",
        count(*)::int AS total,
        count(*) FILTER (WHERE res.status = 'pass')::int AS passes,
        count(*) FILTER (WHERE res.status = 'fail')::int AS failures,
        ROUND(
          CASE WHEN count(*) > 0
            THEN count(*) FILTER (WHERE res.status = 'pass')::numeric / count(*)::numeric * 100
            ELSE 0
          END, 1
        )::float AS "passRate"
       FROM test_run_results res
       JOIN users u ON res.executed_by_id = u.id
       JOIN test_runs r ON res.run_id = r.id
       JOIN projects p ON r.project_id = p.id
       WHERE ${pScope} AND res.executed_by_id IS NOT NULL AND res.status IS NOT NULL
       GROUP BY u.id, u.first_name, u.last_name
       ORDER BY passes DESC, "passRate" DESC
       LIMIT $${params.length}`,
      params
    );
  }

  // Feature requests per status, and per project+status (so the dashboard can show
  // which project each one belongs to) — admin-only dashboard card.
  async featureRequestBreakdown(organizationId, projectId) {
    const [pScope, params] = this.scope(organizationId, projectId);
    const rows = await this.ds.query(
      `SELECT p.id AS "projectId", p.name AS "projectName", fr.status AS key, count(*)::int AS count
       FROM feature_requests fr
       JOIN projects p ON fr.project_id = p.id
       WHERE ${pScope} AND fr.deleted_at IS NULL
       GROUP BY p.id, p.name, fr.status
       ORDER BY p.name, count DESC`,
      params
    );
    return rows;
  }

  // Bugs per status, and per project+status — admin-only dashboard card.
  async bugBreakdown(organizationId, projectId) {
    const [pScope, params] = this.scope(organizationId, projectId);
    const rows = await this.ds.query(
      `SELECT p.id AS "projectId", p.name AS "projectName", b.status AS key, count(*)::int AS count
       FROM bugs b
       JOIN projects p ON b.project_id = p.id
       WHERE ${pScope} AND b.deleted_at IS NULL
       GROUP BY p.id, p.name, b.status
       ORDER BY p.name, count DESC`,
      params
    );
    return rows;
  }

  // Filterable, paginated recent-runs feed for the dashboard card.
  // Count only runs on page 1, matching the shared pagination convention.
  // assigneeId set => the per-run result counts (the progress bar) cover ONLY the
  // cases assigned to that user, so e.g. 10/10 of their own cases reads as 100%.
  async recentRuns(
    organizationId,
    { projectId, suiteId, status, assigneeId, page = 1, limit = 10 } = {}
  ) {
    const [pScope, scopeParams] = this.scope(organizationId, projectId);

    // Run-level filters — referenced by both the data and count queries (same indices).
    const filterParams = [...scopeParams];
    let runFilters = "";
    // Plain users only see runs in projects visible to them (member or assigned).
    if (assigneeId) {
      runFilters += ` AND ${this.userProjectScope(filterParams, assigneeId)}`;
    }
    if (suiteId) {
      filterParams.push(suiteId);
      runFilters += ` AND r.suite_id = $${filterParams.length}`;
    }
    if (status) {
      filterParams.push(status);
      runFilters += ` AND r.status = $${filterParams.length}`;
    }

    // Optional assignee scope for the counts — applied in the results JOIN so
    // unassigned results become NULL and fall out of the aggregates.
    const dataParams = [...filterParams];
    let assigneeJoin = "";
    if (assigneeId) {
      dataParams.push(assigneeId);
      assigneeJoin = ` AND EXISTS (SELECT 1 FROM test_case_assignees tca WHERE tca.test_case_id = res.test_case_id AND tca.user_id = $${dataParams.length})`;
    }

    const limitIdx = dataParams.push(limit);
    const offsetIdx = dataParams.push(getOffset(page, limit));

    const data = await this.ds.query(
      `SELECT r.id, r.name, r.status, r.created_at AS "createdAt",
        r.project_id AS "projectId", p.name AS "projectName",
        r.suite_id AS "suiteId", ts.name AS "suiteName",
        trim(concat(u.first_name, ' ', u.last_name)) AS "createdByName",
        count(res.id)::int AS total,
        count(*) FILTER (WHERE res.status = 'pass')::int AS pass,
        count(*) FILTER (WHERE res.status = 'fail')::int AS fail,
        count(*) FILTER (WHERE res.status = 'blocked')::int AS blocked,
        count(*) FILTER (WHERE res.status = 'skipped')::int AS skipped,
        (
          SELECT array_agg(name ORDER BY name)
          FROM (
            SELECT DISTINCT trim(concat(ut.first_name, ' ', ut.last_name)) AS name
            FROM test_run_results res2
            JOIN users ut ON res2.executed_by_id = ut.id
            WHERE res2.run_id = r.id AND res2.status IS NOT NULL
          ) tnames
        ) AS testers
       FROM test_runs r
       JOIN projects p ON r.project_id = p.id
       LEFT JOIN test_suites ts ON ts.id = r.suite_id
       LEFT JOIN users u ON r.created_by_id = u.id
       LEFT JOIN test_run_results res ON res.run_id = r.id${assigneeJoin}
       WHERE ${pScope}${runFilters}
       GROUP BY r.id, p.name, ts.name, u.first_name, u.last_name
       ORDER BY r.created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      dataParams
    );

    let total = 0;
    if (page === 1) {
      const [row] = await this.ds.query(
        `SELECT count(*)::int n FROM test_runs r
         JOIN projects p ON r.project_id = p.id
         WHERE ${pScope}${runFilters}`,
        filterParams
      );
      total = row.n;
    }

    return { data, meta: buildMeta(page, limit, total, data.length) };
  }
}

module.exports = { DashboardRepository };
