// modules/testRun/services/testRun.service.js
const { TestRunRepository } = require("../repositories/testRun.repository");
const {
  TestRunResultRepository,
} = require("../../testRunResult/repositories/testRunResult.repository");
const { TestCaseRepository } = require("../../testCase/repositories/testCase.repository");
const { TestSuiteService } = require("../../testSuite/services/testSuite.service");
const { NotificationService } = require("../../notification/services/notification.service");
const {
  ProjectMemberRepository,
} = require("../../project/repositories/projectMember.repository");
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

  // Returns actor.id when the actor's run/result visibility must be restricted
  // to their own work, or undefined for full visibility. Admins/superadmins and
  // the project's team leads see everything.
  async restrictToUser(actor, projectId) {
    if (actor.role !== UserRole.USER) return undefined;
    const isLead = await this.suiteService.projectService.isTeamLead(actor, projectId);
    return isLead ? undefined : actor.id;
  }

  async fetchTestRuns(actor, params) {
    await this.suiteService.projectService.getProject(actor, params.projectId);
    // Regular users only see runs they started or have recorded a result in.
    const restrictToUserId = await this.restrictToUser(actor, params.projectId);
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
    // the results list they see below it. Admins and team leads keep the run-wide total.
    const assigneeId = await this.restrictToUser(actor, run.projectId);
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

    const project = await this.suiteService.projectService.getProject(actor, data.projectId);

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
      await this.restrictToUser(actor, data.projectId)
    );
    ActivityService.Instance.log(actor, {
      action: "run.created",
      summary: `Started test run "${run.name}" on suite "${suite.name}" in project "${project.name}"`,
      entityType: "test_run",
      entityId: run.id,
      metadata: { projectId: run.projectId, suiteId: run.suiteId },
    });
    return { run, summary };
  }

  async updateTestRun(actor, id, data) {
    const { run } = await this.getTestRun(actor, id);
    const wasCompleted = run.status === RunStatus.COMPLETED;

    // Only admins or the project's team lead can reopen a completed run.
    if (
      wasCompleted &&
      data.status === RunStatus.IN_PROGRESS &&
      !(await this.suiteService.projectService.canManageProject(actor, run.projectId))
    ) {
      throw new AppError("Only admins or the project's team lead can reopen a completed run.", 403);
    }

    const patch = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.status !== undefined) patch.status = data.status;
    const updated = await this.runRepo.update(run.id, patch);
    const summary = await this.resultRepo.statusSummary(
      run.id,
      await this.restrictToUser(actor, run.projectId)
    );

    // Notify the run's creator + every project member when a run is completed
    // (whoever completed it is excluded — they already know).
    if (data.status === RunStatus.COMPLETED && !wasCompleted) {
      ProjectMemberRepository.Instance.findMemberUsers(run.projectId)
        .then((members) => {
          const recipientIds = new Set(members.map((m) => m.id));
          if (run.createdById) recipientIds.add(run.createdById);
          recipientIds.delete(actor.id);
          if (recipientIds.size === 0) return;
          return NotificationService.Instance.notifyRunCompleted([...recipientIds], {
            runName: updated.name,
            runId: run.id,
            projectId: run.projectId,
            summary,
            byUserId: actor.id,
          });
        })
        .catch((e) => console.error("[notify] run-completed failed:", e.message));
    }

    if (data.status === RunStatus.COMPLETED && !wasCompleted) {
      const suite = await this.suiteService.suiteRepo.findById(run.suiteId);
      ActivityService.Instance.log(actor, {
        action: "run.completed",
        summary: `Completed test run "${updated.name}"${suite ? ` on suite "${suite.name}"` : ""}`,
        entityType: "test_run",
        entityId: run.id,
        metadata: { projectId: run.projectId, suiteId: run.suiteId },
      });
    }

    return { run: updated, summary };
  }

  async deleteTestRun(actor, id) {
    const { run } = await this.getTestRun(actor, id);
    await this.suiteService.projectService.assertCanManageProject(actor, run.projectId);
    await this.runRepo.delete(run.id);
  }
}

module.exports = { TestRunService };
