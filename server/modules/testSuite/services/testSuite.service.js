// modules/testSuite/services/testSuite.service.js
const { TestSuiteRepository } = require("../repositories/testSuite.repository");
const { ProjectService } = require("../../project/services/project.service");
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

  async fetchTestSuites(ownerId, params) {
    // Ensure the caller owns the project before listing its suites.
    await this.projectService.getProject(ownerId, params.projectId);
    return this.suiteRepo.fetchPaginated(params);
  }

  async getTestSuite(ownerId, id) {
    const suite = await this.suiteRepo.findById(id);
    if (!suite || suite.deletedAt) {
      throw new AppError("Test suite not found", 404);
    }
    await this.projectService.getProject(ownerId, suite.projectId); // access check
    return suite;
  }

  async createTestSuite(ownerId, data) {
    await this.projectService.getProject(ownerId, data.projectId);
    return this.suiteRepo.create({
      name: data.name,
      description: data.description ?? null,
      projectId: data.projectId,
    });
  }

  async updateTestSuite(ownerId, id, data) {
    const suite = await this.getTestSuite(ownerId, id);
    const patch = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.description !== undefined) patch.description = data.description;
    return this.suiteRepo.update(suite.id, patch);
  }

  async deleteTestSuite(ownerId, id) {
    const suite = await this.getTestSuite(ownerId, id);
    await this.suiteRepo.softDelete(suite.id);
  }
}

module.exports = { TestSuiteService };
