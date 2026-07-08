// modules/dashboard/services/dashboard.service.js
const { DashboardRepository } = require("../repositories/dashboard.repository");
const { UserRole } = require("../../../config/constants");

// Rows are (projectId, projectName, key, count) from a per-project+status query.
// Rolls them up into an overall status total plus a per-project breakdown, so the
// dashboard can show which project each item belongs to.
function groupByProject(rows) {
  const byStatus = new Map();
  const byProject = new Map();
  for (const row of rows) {
    byStatus.set(row.key, (byStatus.get(row.key) ?? 0) + row.count);

    if (!byProject.has(row.projectId)) {
      byProject.set(row.projectId, {
        projectId: row.projectId,
        projectName: row.projectName,
        total: 0,
        byStatus: [],
      });
    }
    const project = byProject.get(row.projectId);
    project.total += row.count;
    project.byStatus.push({ key: row.key, count: row.count });
  }

  return {
    total: rows.reduce((n, r) => n + r.count, 0),
    byStatus: [...byStatus.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count),
    byProject: [...byProject.values()].sort((a, b) => b.total - a.total),
  };
}

class DashboardService {
  static Instance = new DashboardService();

  constructor(repo = DashboardRepository.Instance) {
    this.repo = repo;
  }

  async overview(actor, projectId) {
    const organizationId = actor.organizationId;
    // Team performance + FR/bug oversight are for company admins only.
    const isAdmin = actor.role === UserRole.ADMIN || actor.role === UserRole.SUPERADMIN;

    const [
      totals,
      caseStatus,
      casePriority,
      resultBreakdown,
      projectsBreakdown,
      suitesBreakdown,
      topPerformers,
      featureRequests,
      bugs,
    ] = await Promise.all([
      this.repo.totals(organizationId, projectId),
      this.repo.caseDistribution(organizationId, projectId, "status"),
      this.repo.caseDistribution(organizationId, projectId, "priority"),
      this.repo.resultBreakdown(organizationId, projectId),
      this.repo.projectsBreakdown(organizationId, projectId),
      this.repo.suitesBreakdown(organizationId, projectId),
      isAdmin ? this.repo.topPerformers(organizationId, projectId) : Promise.resolve(null),
      isAdmin ? this.repo.featureRequestBreakdown(organizationId, projectId) : Promise.resolve(null),
      isAdmin ? this.repo.bugBreakdown(organizationId, projectId) : Promise.resolve(null),
    ]);

    const passRate =
      resultBreakdown.total > 0
        ? Math.round((resultBreakdown.pass / resultBreakdown.total) * 100)
        : 0;

    return {
      totals,
      caseStatus,
      casePriority,
      resultBreakdown,
      passRate,
      projectsBreakdown,
      suitesBreakdown,
      // Admin-only sections are omitted (undefined) for regular users.
      topPerformers: topPerformers
        ? topPerformers.map((p) => ({
            id: p.id,
            name: [p.firstName, p.lastName].filter(Boolean).join(" "),
            total: p.total,
            passes: p.passes,
            failures: p.failures,
            passRate: p.passRate,
          }))
        : undefined,
      featureRequests: featureRequests ? groupByProject(featureRequests) : undefined,
      bugs: bugs ? groupByProject(bugs) : undefined,
    };
  }

  async recentRuns(actor, { projectId, suiteId, status, page, limit } = {}) {
    // Regular users' progress bars count only cases assigned to them; admins see
    // the run-wide totals for oversight.
    const assigneeId = actor.role === UserRole.USER ? actor.id : undefined;
    const { data, meta } = await this.repo.recentRuns(actor.organizationId, {
      projectId,
      suiteId,
      status,
      assigneeId,
      page,
      limit,
    });
    return {
      data: data.map((r) => ({
        id: r.id,
        name: r.name,
        status: r.status,
        projectId: r.projectId,
        projectName: r.projectName,
        suiteId: r.suiteId,
        suiteName: r.suiteName,
        createdAt: r.createdAt,
        createdByName: r.createdByName || null,
        testers: r.testers ?? [],
        summary: {
          total: r.total,
          pass: r.pass,
          fail: r.fail,
          blocked: r.blocked,
          skipped: r.skipped,
        },
      })),
      meta,
    };
  }
}

module.exports = { DashboardService };
