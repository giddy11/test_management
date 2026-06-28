// modules/testCase/services/testCase.service.js
const { TestCaseRepository } = require("../repositories/testCase.repository");
const { TestSuiteService } = require("../../testSuite/services/testSuite.service");
const { AuthRepository } = require("../../auth/repositories/auth.repository");
const { AppError } = require("../../../shared/errors/AppError");
const { TestCaseStatus } = require("../../../config/constants");

class TestCaseService {
  static Instance = new TestCaseService();

  constructor(
    tcRepo = TestCaseRepository.Instance,
    suiteService = TestSuiteService.Instance,
    authRepo = AuthRepository.Instance
  ) {
    this.tcRepo = tcRepo;
    this.suiteService = suiteService;
    this.authRepo = authRepo;
  }

  async fetchTestCases(ownerId, params) {
    await this.suiteService.getTestSuite(ownerId, params.suite); // access check
    return this.tcRepo.fetchPaginated({ ...params, suiteId: params.suite });
  }

  async getTestCase(ownerId, id) {
    const tc = await this.tcRepo.findById(id);
    if (!tc || tc.deletedAt) {
      throw new AppError("Test case not found", 404);
    }
    await this.suiteService.getTestSuite(ownerId, tc.suiteId); // access check
    return tc;
  }

  async createTestCase(ownerId, data) {
    await this.suiteService.getTestSuite(ownerId, data.suite);
    if (data.assignedTo) await this.assertUserExists(data.assignedTo);

    return this.tcRepo.create({
      title: data.title,
      description: data.description ?? null,
      steps: data.steps,
      expectedResult: data.expectedResult,
      priority: data.priority,
      status: data.status ?? TestCaseStatus.DRAFT,
      suiteId: data.suite,
      assignedToId: data.assignedTo ?? null,
      tags: data.tags ?? null,
      createdById: ownerId,
    });
  }

  async updateTestCase(ownerId, id, data) {
    const tc = await this.getTestCase(ownerId, id);
    if (data.assignedTo) await this.assertUserExists(data.assignedTo);

    const patch = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.description !== undefined) patch.description = data.description;
    if (data.steps !== undefined) patch.steps = data.steps;
    if (data.expectedResult !== undefined) patch.expectedResult = data.expectedResult;
    if (data.priority !== undefined) patch.priority = data.priority;
    if (data.status !== undefined) patch.status = data.status;
    if (data.assignedTo !== undefined) patch.assignedToId = data.assignedTo;
    if (data.tags !== undefined) patch.tags = data.tags;

    return this.tcRepo.update(tc.id, patch);
  }

  async deleteTestCase(ownerId, id) {
    const tc = await this.getTestCase(ownerId, id);
    await this.tcRepo.softDelete(tc.id);
  }

  async assertUserExists(userId) {
    const user = await this.authRepo.findUserById(userId);
    if (!user) throw new AppError("Assigned user not found", 404);
  }
}

module.exports = { TestCaseService };
