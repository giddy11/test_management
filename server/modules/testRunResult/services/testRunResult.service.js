// modules/testRunResult/services/testRunResult.service.js
const {
  TestRunResultRepository,
} = require("../repositories/testRunResult.repository");
const { TestRunService } = require("../../testRun/services/testRun.service");
const { TestCaseRepository } = require("../../testCase/repositories/testCase.repository");
const { TestSuiteRepository } = require("../../testSuite/repositories/testSuite.repository");
const { ProjectRepository } = require("../../project/repositories/project.repository");
const { ActivityService } = require("../../activity/services/activity.service");
const { AppError } = require("../../../shared/errors/AppError");
const {
  seesAllProjects,
  restrictToOwnWork,
} = require("../../../shared/access/scope");

class TestRunResultService {
  static Instance = new TestRunResultService();

  constructor(
    resultRepo = TestRunResultRepository.Instance,
    runService = TestRunService.Instance,
    tcRepo = TestCaseRepository.Instance,
    suiteRepo = TestSuiteRepository.Instance,
    projectRepo = ProjectRepository.Instance
  ) {
    this.resultRepo = resultRepo;
    this.runService = runService;
    this.tcRepo = tcRepo;
    this.suiteRepo = suiteRepo;
    this.projectRepo = projectRepo;
  }

  async fetchResults(actor, params) {
    await this.runService.getTestRun(actor, params.runId); // access check
    return this.resultRepo.fetchPaginated({
      ...params,
      // Without org-wide project visibility, only results for test cases
      // assigned to the actor.
      assigneeId: restrictToOwnWork(actor),
    });
  }

  async getResult(actor, id) {
    const result = await this.resultRepo.findById(id);
    if (!result) throw new AppError("Run result not found", 404);
    await this.runService.getTestRun(actor, result.runId); // org access check
    // Without org-wide project visibility, only results for cases assigned
    // to the actor may be touched.
    if (!seesAllProjects(actor)) {
      const tc = await this.tcRepo.findById(result.testCaseId);
      if (!tc || !(tc.assignees ?? []).some((u) => u.id === actor.id)) {
        throw new AppError("Run result not found", 404);
      }
    }
    return result;
  }

  // The result, once the caller is known to be allowed to take part in its
  // project. Used by anything that WRITES against a result.
  async getResultForContribution(actor, id) {
    const result = await this.getResult(actor, id);
    const { run } = await this.runService.getTestRun(actor, result.runId);
    await this.runService.suiteService.projectService.assertCanContribute(actor, run.projectId);
    return result;
  }

  async createResult(actor, data) {
    const { run } = await this.runService.getTestRun(actor, data.runId);
    await this.runService.suiteService.projectService.assertCanContribute(actor, run.projectId);
    const tc = await this.tcRepo.findById(data.testCaseId);
    if (!tc || tc.deletedAt) throw new AppError("Test case not found", 404);

    return this.resultRepo.create({
      runId: data.runId,
      testCaseId: data.testCaseId,
      status: null,
    });
  }

  async recordResult(actor, id, data) {
    const result = await this.getResult(actor, id);
    const { run } = await this.runService.getTestRun(actor, result.runId);
    const projectService = this.runService.suiteService.projectService;
    await projectService.assertCanContribute(actor, run.projectId);

    // Recording a result and amending one after the run was closed are
    // different things. Recording is taking part in the project; changing a
    // frozen result is the project's team lead's call, and every such change is
    // written to the audit log with its before and after values.
    const isAmendment = run.status === "completed";
    if (isAmendment) {
      if (!(await projectService.canManageProject(actor, run.projectId))) {
        throw new AppError(
          "This run is completed. Reopen it before recording results.",
          403
        );
      }
      ActivityService.Instance.log(actor, {
        action: "result.amended",
        summary: `Amended a result on the completed run "${run.name}"`,
        entityType: "test_run_result",
        entityId: result.id,
        metadata: {
          runId: run.id,
          projectId: run.projectId,
          before: {
            status: result.status,
            actualResult: result.actualResult,
            notes: result.notes,
          },
          after: {
            status: data.status !== undefined ? data.status : result.status,
            actualResult:
              data.actualResult !== undefined ? data.actualResult : result.actualResult,
            notes: data.notes !== undefined ? data.notes : result.notes,
          },
        },
      });
    }

    const patch = {};
    if (data.actualResult !== undefined) patch.actualResult = data.actualResult;
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.status !== undefined) {
      patch.status = data.status;
      if (data.status === null) {
        // Cleared back to pending — drop the executor stamp.
        patch.executedById = null;
        patch.executedAt = null;
      } else {
        patch.executedById = actor.id;
        patch.executedAt = new Date();
      }
    }

    const updated = await this.resultRepo.update(result.id, patch);
    if (data.status) {
      const [tc, suite, project] = await Promise.all([
        this.tcRepo.findById(result.testCaseId),
        this.suiteRepo.findById(run.suiteId),
        this.projectRepo.findById(run.projectId),
      ]);
      ActivityService.Instance.log(actor, {
        action: "result.recorded",
        summary: `Recorded "${data.status}" on "${tc?.title ?? "a test case"}"${
          suite ? ` in suite "${suite.name}"` : ""
        }${project ? ` (project "${project.name}", run "${run.name}")` : ""}`,
        entityType: "test_run_result",
        entityId: result.id,
        metadata: {
          runId: result.runId,
          testCaseId: result.testCaseId,
          projectId: run.projectId,
          suiteId: tc?.suiteId ?? run.suiteId ?? null,
        },
      });
    }
    return updated;
  }

  async deleteResult(actor, id) {
    const result = await this.getResult(actor, id);
    const { run } = await this.runService.getTestRun(actor, result.runId);
    await this.runService.suiteService.projectService.assertCanManageProject(actor, run.projectId);
    await this.resultRepo.delete(result.id);
  }

  async bulkRecordResults(actor, { runId, ids, status }) {
    const { run } = await this.runService.getTestRun(actor, runId); // access check
    await this.runService.suiteService.projectService.assertCanContribute(actor, run.projectId);
    if (run.status === "completed") {
      throw new AppError("This run is completed. Reopen it before recording results.", 403);
    }

    const now = new Date();
    const patch =
      status === null
        ? { status: null, executedById: null, executedAt: null }
        : { status, executedById: actor.id, executedAt: now };

    await this.resultRepo.bulkUpdateForRun(runId, ids, patch);

    const [suite, project] = await Promise.all([
      this.suiteRepo.findById(run.suiteId),
      this.projectRepo.findById(run.projectId),
    ]);
    ActivityService.Instance.log(actor, {
      action: "result.bulk_recorded",
      summary: `Set ${ids.length} result${ids.length === 1 ? "" : "s"} to "${status ?? "pending"}"${
        suite ? ` in suite "${suite.name}"` : ""
      }${project ? ` (project "${project.name}", run "${run.name}")` : ""}`,
      entityType: "test_run_result",
      entityId: runId,
      metadata: { runId, count: ids.length, status, projectId: run.projectId, suiteId: run.suiteId },
    });
  }
}

module.exports = { TestRunResultService };
