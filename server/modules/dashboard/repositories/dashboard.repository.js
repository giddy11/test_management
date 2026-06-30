// modules/dashboard/repositories/dashboard.repository.js
// Aggregate analytics, scoped to the requesting user's projects (owner_id),
// optionally narrowed to one project.
const { AppDataSource } = require("../../../infrastructure/database/dataSource");

class DashboardRepository {
  static Instance = new DashboardRepository();

  constructor() {
    this.ds = AppDataSource;
  }

  // Returns [whereSql, params] applying owner scope (+ optional project filter).
  scope(ownerId, projectId, alias = "p") {
    const params = [ownerId];
    let sql = `${alias}.owner_id = $1 AND ${alias}.deleted_at IS NULL`;
    if (projectId) {
      params.push(projectId);
      sql += ` AND ${alias}.id = $${params.length}`;
    }
    return [sql, params];
  }

  async totals(ownerId, projectId) {
    const [pScope, params] = this.scope(ownerId, projectId);
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

  async caseDistribution(ownerId, projectId, column) {
    const [pScope, params] = this.scope(ownerId, projectId);
    return this.ds.query(
      `SELECT tc.${column} AS key, count(*)::int AS count FROM test_cases tc
       JOIN test_suites ts ON tc.suite_id = ts.id
       JOIN projects p ON ts.project_id = p.id
       WHERE ${pScope} AND ts.deleted_at IS NULL AND tc.deleted_at IS NULL
       GROUP BY tc.${column} ORDER BY count DESC`,
      params
    );
  }

  async resultBreakdown(ownerId, projectId) {
    const [pScope, params] = this.scope(ownerId, projectId);
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

  async recentRuns(ownerId, projectId, limit = 6) {
    const [pScope, params] = this.scope(ownerId, projectId);
    params.push(limit);
    return this.ds.query(
      `SELECT r.id, r.name, r.status, r.project_id AS "projectId", r.created_at AS "createdAt",
        count(res.id)::int AS total,
        count(*) FILTER (WHERE res.status = 'pass')::int AS pass,
        count(*) FILTER (WHERE res.status = 'fail')::int AS fail,
        count(*) FILTER (WHERE res.status = 'blocked')::int AS blocked,
        count(*) FILTER (WHERE res.status = 'skipped')::int AS skipped
       FROM test_runs r
       JOIN projects p ON r.project_id = p.id
       LEFT JOIN test_run_results res ON res.run_id = r.id
       WHERE ${pScope}
       GROUP BY r.id
       ORDER BY r.created_at DESC
       LIMIT $${params.length}`,
      params
    );
  }
}

module.exports = { DashboardRepository };
