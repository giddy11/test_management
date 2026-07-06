// modules/dashboard/services/dashboard.service.js
const { DashboardRepository } = require("../repositories/dashboard.repository");
const { UserRole } = require("../../../config/constants");

class DashboardService {
  static Instance = new DashboardService();

  constructor(repo = DashboardRepository.Instance) {
    this.repo = repo;
  }

  async overview(organizationId, projectId) {
    const [
      totals,
      caseStatus,
      casePriority,
      resultBreakdown,
      projectsBreakdown,
      suitesBreakdown,
      topPerformers,
    ] = await Promise.all([
      this.repo.totals(organizationId, projectId),
      this.repo.caseDistribution(organizationId, projectId, "status"),
      this.repo.caseDistribution(organizationId, projectId, "priority"),
      this.repo.resultBreakdown(organizationId, projectId),
      this.repo.projectsBreakdown(organizationId, projectId),
      this.repo.suitesBreakdown(organizationId, projectId),
      this.repo.topPerformers(organizationId, projectId),
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
      topPerformers: topPerformers.map((p) => ({
        id: p.id,
        name: [p.firstName, p.lastName].filter(Boolean).join(" "),
        total: p.total,
        passes: p.passes,
        failures: p.failures,
        passRate: p.passRate,
      })),
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
