// modules/testSuite/services/testSuite.service.js
const { TestSuiteRepository } = require("../repositories/testSuite.repository");
const { ProjectService } = require("../../project/services/project.service");
const { ActivityService } = require("../../activity/services/activity.service");
const { AppError } = require("../../../shared/errors/AppError");

class TestSuiteService {
  static Instance = new TestSuiteService();

  constructor(
    suiteRepo = TestSuiteRepository.Instance,
    projectService = ProjectService.Instance
  ) {
    this.suiteRepo = suiteRepo;
    this.projectService = projectService;
  }

  async fetchTestSuites(actor, params) {
    // Ensure the caller owns the project before listing its suites.
    await this.projectService.getProject(actor, params.projectId);
    return this.suiteRepo.fetchPaginated(params);
  }

  async getTestSuite(actor, id) {
    const suite = await this.suiteRepo.findById(id);
    if (!suite || suite.deletedAt) {
      throw new AppError("Test suite not found", 404);
    }
    await this.projectService.getProject(actor, suite.projectId); // access check
    return suite;
  }

  async createTestSuite(actor, data) {
    await this.projectService.getProject(actor, data.projectId);
    const suite = await this.suiteRepo.create({
      name: data.name,
      description: data.description ?? null,
      projectId: data.projectId,
    });
    ActivityService.Instance.log(actor, {
      action: "suite.created",
      summary: `Created test suite "${suite.name}"`,
      entityType: "suite",
      entityId: suite.id,
    });
    return suite;
  }

  async updateTestSuite(actor, id, data) {
    const suite = await this.getTestSuite(actor, id);
    const patch = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.description !== undefined) patch.description = data.description;
    return this.suiteRepo.update(suite.id, patch);
  }

  async deleteTestSuite(actor, id) {
    const suite = await this.getTestSuite(actor, id);
    await this.suiteRepo.softDelete(suite.id);
    ActivityService.Instance.log(actor, {
      action: "suite.deleted",
      summary: `Deleted test suite "${suite.name}"`,
      entityType: "suite",
      entityId: suite.id,
    });
  }
}

module.exports = { TestSuiteService };
