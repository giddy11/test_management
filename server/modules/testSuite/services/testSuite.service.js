// modules/testSuite/services/testSuite.service.js
const { TestSuiteRepository } = require("../repositories/testSuite.repository");
const { ProjectService } = require("../../project/services/project.service");
const { TestCaseRepository } = require("../../testCase/repositories/testCase.repository");
const { ActivityService } = require("../../activity/services/activity.service");
const { AppError } = require("../../../shared/errors/AppError");
const { UserRole } = require("../../../config/constants");

class TestSuiteService {
  static Instance = new TestSuiteService();

  constructor(
    suiteRepo = TestSuiteRepository.Instance,
    projectService = ProjectService.Instance,
    testCaseRepo = TestCaseRepository.Instance
  ) {
    this.suiteRepo = suiteRepo;
    this.projectService = projectService;
    this.testCaseRepo = testCaseRepo;
  }

  async fetchTestSuites(actor, params) {
    // Ensure the caller owns the project before listing its suites.
    await this.projectService.getProject(actor, params.projectId);
    return this.suiteRepo.fetchPaginated({
      ...params,
      assigneeId: actor.role === UserRole.USER ? actor.id : undefined,
    });
  }

  async getTestSuite(actor, id) {
    const suite = await this.suiteRepo.findById(id);
    if (!suite || suite.deletedAt) {
      throw new AppError("Test suite not found", 404);
    }
    await this.projectService.getProject(actor, suite.projectId); // access check
    if (actor.role === UserRole.USER) {
      const hasAssignment = await this.testCaseRepo.hasAssignmentInSuite(suite.id, actor.id);
      if (!hasAssignment) {
        throw new AppError("You do not have access to this test suite", 403);
      }
    }
    return suite;
  }

  async createTestSuite(actor, data) {
    const project = await this.projectService.getProject(actor, data.projectId);
    const suite = await this.suiteRepo.create({
      name: data.name,
      description: data.description ?? null,
      projectId: data.projectId,
    });
    ActivityService.Instance.log(actor, {
      action: "suite.created",
      summary: `Created test suite "${suite.name}" in project "${project.name}"`,
      entityType: "suite",
      entityId: suite.id,
      metadata: { projectId: project.id },
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
    const project = await this.projectService.getProject(actor, suite.projectId);
    await this.suiteRepo.softDelete(suite.id);
    ActivityService.Instance.log(actor, {
      action: "suite.deleted",
      summary: `Deleted test suite "${suite.name}" in project "${project.name}"`,
      entityType: "suite",
      entityId: suite.id,
      metadata: { projectId: project.id },
    });
  }
}

module.exports = { TestSuiteService };
