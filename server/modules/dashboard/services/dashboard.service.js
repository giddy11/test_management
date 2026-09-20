// modules/dashboard/services/dashboard.service.js
const { DashboardRepository } = require("../repositories/dashboard.repository");
const { can } = require("../../../shared/access/can");
const {
  seesOrganisationAnalytics,
} = require("../../../shared/access/scope");

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
    // Organisation-wide breakdowns need analytics.read; per-person performance
    // is a separate, more sensitive permission again.
    const seesOrgWide = seesOrganisationAnalytics(actor);
    // Without it, the metrics cover only what relates to the actor: projects
    // they're in, cases assigned to them (or every case of projects they lead).
    const userId = seesOrgWide ? undefined : actor.id;

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
      this.repo.totals(organizationId, projectId, userId),
      this.repo.caseDistribution(organizationId, projectId, "status", userId),
      this.repo.caseDistribution(organizationId, projectId, "priority", userId),
      this.repo.resultBreakdown(organizationId, projectId, userId),
      this.repo.projectsBreakdown(organizationId, projectId, userId),
      this.repo.suitesBreakdown(organizationId, projectId, userId),
      can(actor, "analytics.team")
        ? this.repo.topPerformers(organizationId, projectId)
        : Promise.resolve(null),
      seesOrgWide ? this.repo.featureRequestBreakdown(organizationId, projectId) : Promise.resolve(null),
      seesOrgWide ? this.repo.bugBreakdown(organizationId, projectId) : Promise.resolve(null),
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
    // Without organisation-wide analytics, progress bars count only cases
    // assigned to the actor; with it, the run-wide totals for oversight.
    const assigneeId = seesOrganisationAnalytics(actor) ? undefined : actor.id;
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
          // "Not run" — result rows that exist but haven't been executed yet.
          pending: r.total - r.pass - r.fail - r.blocked - r.skipped,
        },
      })),
      meta,
    };
  }
}

module.exports = { DashboardService };
