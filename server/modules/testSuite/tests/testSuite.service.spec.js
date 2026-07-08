// modules/testSuite/tests/testSuite.service.spec.js
const { TestSuiteService } = require("../services/testSuite.service");

function makeSuiteRepo() {
  return {
    fetchPaginated: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
  };
}

function makeProjectService() {
  return {
    getProject: jest.fn().mockResolvedValue({ id: "proj-1", ownerId: "owner-1" }),
    isTeamLead: jest.fn().mockResolvedValue(false),
    canManageProject: jest.fn().mockImplementation(async (actor) => actor.role !== "user"),
    assertCanManageProject: jest.fn().mockImplementation(async (actor) => {
      if (actor.role === "user") {
        const err = new Error("Only admins or this project's team lead can do this");
        err.statusCode = 403;
        throw err;
      }
    }),
  };
}

function makeTestCaseRepo() {
  return { hasAssignmentInSuite: jest.fn().mockResolvedValue(true) };
}

const admin = { id: "owner-1", role: "admin", organizationId: "org-1" };
const plainUser = { id: "u-1", role: "user", organizationId: "org-1" };
const suite = { id: "suite-1", name: "Auth", projectId: "proj-1", deletedAt: null };

describe("TestSuiteService", () => {
  let suiteRepo;
  let projectService;
  let testCaseRepo;
  let service;

  beforeEach(() => {
    suiteRepo = makeSuiteRepo();
    projectService = makeProjectService();
    testCaseRepo = makeTestCaseRepo();
    service = new TestSuiteService(suiteRepo, projectService, testCaseRepo);
  });

  describe("fetchTestSuites", () => {
    it("checks project access then delegates to the repo", async () => {
      suiteRepo.fetchPaginated.mockResolvedValue({ data: [suite], meta: {} });
      await service.fetchTestSuites(admin, { projectId: "proj-1", page: 1, limit: 20 });
      expect(projectService.getProject).toHaveBeenCalledWith(admin, "proj-1");
      expect(suiteRepo.fetchPaginated).toHaveBeenCalled();
    });

    it("scopes a plain 'user' by assignee", async () => {
      suiteRepo.fetchPaginated.mockResolvedValue({ data: [], meta: {} });
      await service.fetchTestSuites(plainUser, { projectId: "proj-1", page: 1, limit: 20 });
      expect(suiteRepo.fetchPaginated).toHaveBeenCalledWith(
        expect.objectContaining({ assigneeId: "u-1" })
      );
    });

    it("does not assignee-scope an admin", async () => {
      suiteRepo.fetchPaginated.mockResolvedValue({ data: [], meta: {} });
      await service.fetchTestSuites(admin, { projectId: "proj-1", page: 1, limit: 20 });
      expect(suiteRepo.fetchPaginated).toHaveBeenCalledWith(
        expect.objectContaining({ assigneeId: undefined })
      );
    });

    it("does not assignee-scope a team lead of the project", async () => {
      projectService.isTeamLead.mockResolvedValue(true);
      suiteRepo.fetchPaginated.mockResolvedValue({ data: [], meta: {} });
      await service.fetchTestSuites(plainUser, { projectId: "proj-1", page: 1, limit: 20 });
      expect(projectService.isTeamLead).toHaveBeenCalledWith(plainUser, "proj-1");
      expect(suiteRepo.fetchPaginated).toHaveBeenCalledWith(
        expect.objectContaining({ assigneeId: undefined })
      );
    });
  });

  describe("getTestSuite", () => {
    it("returns the suite and verifies project access", async () => {
      suiteRepo.findById.mockResolvedValue(suite);
      await expect(service.getTestSuite(admin, "suite-1")).resolves.toBe(suite);
      expect(projectService.getProject).toHaveBeenCalledWith(admin, "proj-1");
    });

    it("throws 404 when the suite is missing", async () => {
      suiteRepo.findById.mockResolvedValue(null);
      await expect(service.getTestSuite(admin, "suite-1")).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it("throws 403 for a 'user' with no assignment in the suite", async () => {
      suiteRepo.findById.mockResolvedValue(suite);
      testCaseRepo.hasAssignmentInSuite.mockResolvedValue(false);
      await expect(service.getTestSuite(plainUser, "suite-1")).rejects.toMatchObject({
        statusCode: 403,
      });
      expect(testCaseRepo.hasAssignmentInSuite).toHaveBeenCalledWith("suite-1", "u-1");
    });

    it("allows a 'user' assigned to at least one case in the suite", async () => {
      suiteRepo.findById.mockResolvedValue(suite);
      testCaseRepo.hasAssignmentInSuite.mockResolvedValue(true);
      await expect(service.getTestSuite(plainUser, "suite-1")).resolves.toBe(suite);
    });

    it("allows a team lead without any assignment in the suite", async () => {
      suiteRepo.findById.mockResolvedValue(suite);
      projectService.isTeamLead.mockResolvedValue(true);
      testCaseRepo.hasAssignmentInSuite.mockResolvedValue(false);
      await expect(service.getTestSuite(plainUser, "suite-1")).resolves.toBe(suite);
      expect(testCaseRepo.hasAssignmentInSuite).not.toHaveBeenCalled();
    });

    it("does not check assignment for admins/superadmins", async () => {
      suiteRepo.findById.mockResolvedValue(suite);
      await service.getTestSuite(admin, "suite-1");
      expect(testCaseRepo.hasAssignmentInSuite).not.toHaveBeenCalled();
    });
  });

  describe("createTestSuite", () => {
    it("validates the project then creates the suite", async () => {
      suiteRepo.create.mockImplementation(async (d) => ({ id: "suite-2", ...d }));
      const created = await service.createTestSuite(admin, {
        name: "Payment",
        projectId: "proj-1",
      });
      expect(projectService.getProject).toHaveBeenCalledWith(admin, "proj-1");
      expect(created).toMatchObject({ name: "Payment", projectId: "proj-1" });
    });
  });

  describe("updateTestSuite", () => {
    it("patches only provided fields", async () => {
      suiteRepo.findById.mockResolvedValue(suite);
      suiteRepo.update.mockResolvedValue({ ...suite, name: "Renamed" });
      await service.updateTestSuite(admin, "suite-1", { name: "Renamed" });
      expect(suiteRepo.update).toHaveBeenCalledWith("suite-1", { name: "Renamed" });
    });
  });

  describe("deleteTestSuite", () => {
    it("soft-deletes after access checks", async () => {
      suiteRepo.findById.mockResolvedValue(suite);
      await service.deleteTestSuite(admin, "suite-1");
      expect(suiteRepo.softDelete).toHaveBeenCalledWith("suite-1");
    });
  });
});
