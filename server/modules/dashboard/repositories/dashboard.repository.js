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

  async totals(organizationId, projectId) {
    const [pScope, params] = this.scope(organizationId, projectId);
    const [projects] = await this.ds.query(
      `SELECT count(*)::int n FROM projects p WHERE ${pScope}`,
      params
    );
    const [suites] = await this.ds.query(
      `SELECT count(*)::int n FROM test_suites ts
       JOIN projects p ON ts.project_id = p.id
       WHERE ${pScope} AND ts.deleted_at IS NULL`,
      params
    );
    const [cases] = await this.ds.query(
      `SELECT count(*)::int n FROM test_cases tc
       JOIN test_suites ts ON tc.suite_id = ts.id
       JOIN projects p ON ts.project_id = p.id
       WHERE ${pScope} AND ts.deleted_at IS NULL AND tc.deleted_at IS NULL`,
      params
    );
    const [runs] = await this.ds.query(
      `SELECT count(*)::int n FROM test_runs r
       JOIN projects p ON r.project_id = p.id
       WHERE ${pScope}`,
      params
    );
    return {
      projects: projects.n,
      suites: suites.n,
      cases: cases.n,
      runs: runs.n,
    };
  }

  async caseDistribution(organizationId, projectId, column) {
    const [pScope, params] = this.scope(organizationId, projectId);
    return this.ds.query(
      `SELECT tc.${column} AS key, count(*)::int AS count FROM test_cases tc
       JOIN test_suites ts ON tc.suite_id = ts.id
       JOIN projects p ON ts.project_id = p.id
       WHERE ${pScope} AND ts.deleted_at IS NULL AND tc.deleted_at IS NULL
       GROUP BY tc.${column} ORDER BY count DESC`,
      params
    );
  }

  async resultBreakdown(organizationId, projectId) {
    const [pScope, params] = this.scope(organizationId, projectId);
    const rows = await this.ds.query(
      `SELECT COALESCE(res.status::text, 'pending') AS key, count(*)::int AS count
       FROM test_run_results res
       JOIN test_runs r ON res.run_id = r.id
       JOIN projects p ON r.project_id = p.id
       WHERE ${pScope}
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

  async projectsBreakdown(organizationId, projectId) {
    const [pScope, params] = this.scope(organizationId, projectId);
    return this.ds.query(
      `SELECT p.id, p.name,
        count(DISTINCT ts.id)::int AS "suiteCount",
        count(DISTINCT tc.id)::int AS "caseCount"
       FROM projects p
       LEFT JOIN test_suites ts ON ts.project_id = p.id AND ts.deleted_at IS NULL
       LEFT JOIN test_cases tc ON tc.suite_id = ts.id AND tc.deleted_at IS NULL
       WHERE ${pScope}
       GROUP BY p.id, p.name
       ORDER BY p.name`,
      params
    );
  }

  async suitesBreakdown(organizationId, projectId) {
    const [pScope, params] = this.scope(organizationId, projectId);
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
       LEFT JOIN test_cases tc ON tc.suite_id = ts.id AND tc.deleted_at IS NULL
       LEFT JOIN LATERAL (
         SELECT run_id, status
         FROM test_run_results
         WHERE test_case_id = tc.id
         ORDER BY executed_at DESC NULLS LAST, id DESC
         LIMIT 1
       ) latest ON true
       WHERE ${pScope} AND ts.deleted_at IS NULL
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

  // Filterable, paginated recent-runs feed for the dashboard card.
  // Count only runs on page 1, matching the shared pagination convention.
  async recentRuns(organizationId, { projectId, suiteId, page = 1, limit = 10 } = {}) {
    const [pScope, scopeParams] = this.scope(organizationId, projectId);
    const params = [...scopeParams];
    let suiteFilter = "";
    if (suiteId) {
      params.push(suiteId);
      suiteFilter = ` AND r.suite_id = $${params.length}`;
    }

    const offset = getOffset(page, limit);
    const dataParams = [...params, limit, offset];
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
       LEFT JOIN test_run_results res ON res.run_id = r.id
       WHERE ${pScope}${suiteFilter}
       GROUP BY r.id, p.name, ts.name, u.first_name, u.last_name
       ORDER BY r.created_at DESC
       LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams
    );

    let total = 0;
    if (page === 1) {
      const [row] = await this.ds.query(
        `SELECT count(*)::int n FROM test_runs r
         JOIN projects p ON r.project_id = p.id
         WHERE ${pScope}${suiteFilter}`,
        params
      );
      total = row.n;
    }

    return { data, meta: buildMeta(page, limit, total, data.length) };
  }
}

module.exports = { DashboardRepository };
