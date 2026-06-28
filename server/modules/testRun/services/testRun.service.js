// modules/testRun/services/testRun.service.js
const { TestRunRepository } = require("../repositories/testRun.repository");
const {
  TestRunResultRepository,
} = require("../../testRunResult/repositories/testRunResult.repository");
const { TestCaseRepository } = require("../../testCase/repositories/testCase.repository");
const { TestSuiteService } = require("../../testSuite/services/testSuite.service");
const { AppError } = require("../../../shared/errors/AppError");

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

  async fetchTestRuns(ownerId, params) {
    await this.suiteService.projectService.getProject(ownerId, params.projectId);
    return this.runRepo.fetchPaginated(params);
  }

  async getTestRun(ownerId, id) {
    const run = await this.runRepo.findById(id);
    if (!run) throw new AppError("Test run not found", 404);
    await this.suiteService.projectService.getProject(ownerId, run.projectId);
    const summary = await this.resultRepo.statusSummary(run.id);
    return { run, summary };
  }

  async createTestRun(ownerId, data) {
    // Suite must belong to the project, and the project to the caller.
    const suite = await this.suiteService.getTestSuite(ownerId, data.suiteId);
    if (suite.projectId !== data.projectId) {
      throw new AppError("Suite does not belong to the given project", 400);
    }

    const run = await this.runRepo.create({
      name: data.name,
      projectId: data.projectId,
      suiteId: data.suiteId,
      createdById: ownerId,
    });

    // Snapshot: one pending result row per test case in the suite.
    const cases = await this.tcRepo.findAllBySuite(data.suiteId);
    await this.resultRepo.createMany(
      cases.map((c) => ({ runId: run.id, testCaseId: c.id, status: null }))
    );

    const summary = await this.resultRepo.statusSummary(run.id);
    return { run, summary };
  }

  async updateTestRun(ownerId, id, data) {
    const { run } = await this.getTestRun(ownerId, id);
    const patch = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.status !== undefined) patch.status = data.status;
    const updated = await this.runRepo.update(run.id, patch);
    const summary = await this.resultRepo.statusSummary(run.id);
    return { run: updated, summary };
  }

  async deleteTestRun(ownerId, id) {
    const { run } = await this.getTestRun(ownerId, id);
    await this.runRepo.delete(run.id);
  }
}

module.exports = { TestRunService };
