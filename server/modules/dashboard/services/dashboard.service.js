// modules/dashboard/services/dashboard.service.js
const { DashboardRepository } = require("../repositories/dashboard.repository");

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
      recentRuns,
      projectsBreakdown,
      suitesBreakdown,
      topPerformers,
    ] = await Promise.all([
      this.repo.totals(organizationId, projectId),
      this.repo.caseDistribution(organizationId, projectId, "status"),
      this.repo.caseDistribution(organizationId, projectId, "priority"),
      this.repo.resultBreakdown(organizationId, projectId),
      this.repo.recentRuns(organizationId, projectId),
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
      recentRuns: recentRuns.map((r) => ({
        id: r.id,
        name: r.name,
        status: r.status,
        projectId: r.projectId,
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
}

module.exports = { DashboardService };
