// modules/testRunResult/services/testRunResult.service.js
const {
  TestRunResultRepository,
} = require("../repositories/testRunResult.repository");
const { TestRunService } = require("../../testRun/services/testRun.service");
const { TestCaseRepository } = require("../../testCase/repositories/testCase.repository");
const { AppError } = require("../../../shared/errors/AppError");

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

  async fetchResults(ownerId, params) {
    await this.runService.getTestRun(ownerId, params.runId); // access check
    return this.resultRepo.fetchPaginated(params);
  }

  async getResult(ownerId, id) {
    const result = await this.resultRepo.findById(id);
    if (!result) throw new AppError("Run result not found", 404);
    await this.runService.getTestRun(ownerId, result.runId); // access check
    return result;
  }

  async createResult(ownerId, data) {
    await this.runService.getTestRun(ownerId, data.runId);
    const tc = await this.tcRepo.findById(data.testCaseId);
    if (!tc || tc.deletedAt) throw new AppError("Test case not found", 404);

    return this.resultRepo.create({
      runId: data.runId,
      testCaseId: data.testCaseId,
      status: null,
    });
  }

  async recordResult(ownerId, id, data) {
    const result = await this.getResult(ownerId, id);

    const patch = {};
    if (data.actualResult !== undefined) patch.actualResult = data.actualResult;
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.status !== undefined) {
      patch.status = data.status;
      patch.executedById = ownerId;
      patch.executedAt = new Date();
    }

    return this.resultRepo.update(result.id, patch);
  }

  async deleteResult(ownerId, id) {
    const result = await this.getResult(ownerId, id);
    await this.resultRepo.delete(result.id);
  }
}

module.exports = { TestRunResultService };
