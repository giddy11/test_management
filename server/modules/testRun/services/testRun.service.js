// modules/testRun/services/testRun.service.js
const { TestRunRepository } = require("../repositories/testRun.repository");
const {
  TestRunResultRepository,
} = require("../../testRunResult/repositories/testRunResult.repository");
const { TestCaseRepository } = require("../../testCase/repositories/testCase.repository");
const { TestSuiteService } = require("../../testSuite/services/testSuite.service");
const { NotificationService } = require("../../notification/services/notification.service");
const { ActivityService } = require("../../activity/services/activity.service");
const { AppError } = require("../../../shared/errors/AppError");
const { RunStatus, UserRole } = require("../../../config/constants");

class TestRunService {
  static Instance = new TestRunService();

  constructor(
    runRepo = TestRunRepository.Instance,
    resultRepo = TestRunResultRepository.Instance,
    tcRepo = TestCaseRepository.Instance,
    suiteService = TestSuiteService.Instance
  ) {
    this.runRepo = runRepo;
    this.resultRepo = resultRepo;
    this.tcRepo = tcRepo;
    this.suiteService = suiteService;
  }

  async fetchTestRuns(actor, params) {
    await this.suiteService.projectService.getProject(actor, params.projectId);
    // Regular users only see runs they started or have recorded a result in.
    // Admins/superadmins retain full visibility for oversight.
    const restrictToUserId = actor.role === UserRole.USER ? actor.id : undefined;
    return this.runRepo.fetchPaginated({ ...params, restrictToUserId });
  }

  async getActiveRunStatus(actor, projectId) {
    await this.suiteService.projectService.getProject(actor, projectId);
    const activeRuns = await this.runRepo.findActiveByProject(projectId);
    return { activeSuiteIds: activeRuns.map((r) => r.suiteId) };
  }

  async getTestRun(actor, id) {
    const run = await this.runRepo.findById(id);
    if (!run) throw new AppError("Test run not found", 404);
    await this.suiteService.projectService.getProject(actor, run.projectId);
    // A plain user's progress reflects only the cases assigned to them, matching
    // the results list they see below it. Admins keep the run-wide total.
    const assigneeId = actor.role === UserRole.USER ? actor.id : undefined;
    const summary = await this.resultRepo.statusSummary(run.id, assigneeId);
    return { run, summary };
  }

  async createTestRun(actor, data) {
    // Suite must belong to the project, and the project to the caller.
    const suite = await this.suiteService.getTestSuite(actor, data.suiteId);
    if (suite.projectId !== data.projectId) {
      throw new AppError("Suite does not belong to the given project", 400);
    }

    // Only one run may be in progress per suite at a time (other suites are unaffected).
    const activeRun = await this.runRepo.findActiveBySuite(data.suiteId);
    if (activeRun) {
      throw new AppError(
        "An ongoing test run already exists for this suite. Complete it before starting a new one.",
        409
      );
    }

    const run = await this.runRepo.create({
      name: data.name,
      projectId: data.projectId,
      suiteId: data.suiteId,
      createdById: actor.id,
    });

    // Snapshot: one pending result row per test case in the suite.
    const cases = await this.tcRepo.findAllBySuite(data.suiteId);
    await this.resultRepo.createMany(
      cases.map((c) => ({ runId: run.id, testCaseId: c.id, status: null }))
    );

    const summary = await this.resultRepo.statusSummary(
      run.id,
      actor.role === UserRole.USER ? actor.id : undefined
    );
    ActivityService.Instance.log(actor, {
      action: "run.created",
      summary: `Started test run "${run.name}"`,
      entityType: "test_run",
      entityId: run.id,
      metadata: { projectId: run.projectId },
    });
    return { run, summary };
  }

  async updateTestRun(actor, id, data) {
    const { run } = await this.getTestRun(actor, id);
    const wasCompleted = run.status === RunStatus.COMPLETED;

    // Only admins can reopen a completed run.
    if (
      wasCompleted &&
      data.status === RunStatus.IN_PROGRESS &&
      actor.role === UserRole.USER
    ) {
      throw new AppError("Only admins can reopen a completed run.", 403);
    }

    const patch = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.status !== undefined) patch.status = data.status;
    const updated = await this.runRepo.update(run.id, patch);
    const summary = await this.resultRepo.statusSummary(
      run.id,
      actor.role === UserRole.USER ? actor.id : undefined
    );

    // Notify the run's creator when someone else completes it.
    if (
      data.status === RunStatus.COMPLETED &&
      !wasCompleted &&
      run.createdById &&
      run.createdById !== actor.id
    ) {
      NotificationService.Instance.notifyRunCompleted(run.createdById, {
        runName: updated.name,
        runId: run.id,
        projectId: run.projectId,
        summary,
        byUserId: actor.id,
      }).catch((e) => console.error("[notify] run-completed failed:", e.message));
    }

    if (data.status === RunStatus.COMPLETED && !wasCompleted) {
      ActivityService.Instance.log(actor, {
        action: "run.completed",
        summary: `Completed test run "${updated.name}"`,
        entityType: "test_run",
        entityId: run.id,
        metadata: { projectId: run.projectId },
      });
    }

    return { run: updated, summary };
  }

  async deleteTestRun(actor, id) {
    const { run } = await this.getTestRun(actor, id);
    await this.runRepo.delete(run.id);
  }
}

module.exports = { TestRunService };
