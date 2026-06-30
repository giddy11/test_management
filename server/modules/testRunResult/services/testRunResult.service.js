// modules/testRunResult/services/testRunResult.service.js
const {
  TestRunResultRepository,
} = require("../repositories/testRunResult.repository");
const { TestRunService } = require("../../testRun/services/testRun.service");
const { TestCaseRepository } = require("../../testCase/repositories/testCase.repository");
const { ActivityService } = require("../../activity/services/activity.service");
const { AppError } = require("../../../shared/errors/AppError");
const { UserRole } = require("../../../config/constants");

class TestRunResultService {
  static Instance = new TestRunResultService();

  constructor(
    resultRepo = TestRunResultRepository.Instance,
    runService = TestRunService.Instance,
    tcRepo = TestCaseRepository.Instance
  ) {
    this.resultRepo = resultRepo;
    this.runService = runService;
    this.tcRepo = tcRepo;
  }

  async fetchResults(actor, params) {
    await this.runService.getTestRun(actor, params.runId); // access check
    return this.resultRepo.fetchPaginated({
      ...params,
      // A plain user only sees results for test cases assigned to them.
      assigneeId: actor.role === UserRole.USER ? actor.id : undefined,
    });
  }

  async getResult(actor, id) {
    const result = await this.resultRepo.findById(id);
    if (!result) throw new AppError("Run result not found", 404);
    await this.runService.getTestRun(actor, result.runId); // org access check
    // A plain user may only touch results for cases assigned to them.
    if (actor.role === UserRole.USER) {
      const tc = await this.tcRepo.findById(result.testCaseId);
      if (!tc || !(tc.assignees ?? []).some((u) => u.id === actor.id)) {
        throw new AppError("Run result not found", 404);
      }
    }
    return result;
  }

  async createResult(actor, data) {
    await this.runService.getTestRun(actor, data.runId);
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
      ActivityService.Instance.log(actor, {
        action: "result.recorded",
        summary: `Recorded "${data.status}" on a test case`,
        entityType: "test_run_result",
        entityId: result.id,
        metadata: { runId: result.runId, testCaseId: result.testCaseId },
      });
    }
    return updated;
  }

  async deleteResult(actor, id) {
    const result = await this.getResult(actor, id);
    await this.resultRepo.delete(result.id);
  }
}

module.exports = { TestRunResultService };
