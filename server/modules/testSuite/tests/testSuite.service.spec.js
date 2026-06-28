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
  return { getProject: jest.fn().mockResolvedValue({ id: "proj-1", ownerId: "owner-1" }) };
}

const suite = { id: "suite-1", name: "Auth", projectId: "proj-1", deletedAt: null };

describe("TestSuiteService", () => {
  let suiteRepo;
  let projectService;
  let service;

  beforeEach(() => {
    suiteRepo = makeSuiteRepo();
    projectService = makeProjectService();
    service = new TestSuiteService(suiteRepo, projectService);
  });

  describe("fetchTestSuites", () => {
    it("checks project access then delegates to the repo", async () => {
      suiteRepo.fetchPaginated.mockResolvedValue({ data: [suite], meta: {} });
      await service.fetchTestSuites("owner-1", { projectId: "proj-1", page: 1, limit: 20 });
      expect(projectService.getProject).toHaveBeenCalledWith("owner-1", "proj-1");
      expect(suiteRepo.fetchPaginated).toHaveBeenCalled();
    });
  });

  describe("getTestSuite", () => {
    it("returns the suite and verifies project access", async () => {
      suiteRepo.findById.mockResolvedValue(suite);
      await expect(service.getTestSuite("owner-1", "suite-1")).resolves.toBe(suite);
      expect(projectService.getProject).toHaveBeenCalledWith("owner-1", "proj-1");
    });

    it("throws 404 when the suite is missing", async () => {
      suiteRepo.findById.mockResolvedValue(null);
      await expect(service.getTestSuite("owner-1", "suite-1")).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  describe("createTestSuite", () => {
    it("validates the project then creates the suite", async () => {
      suiteRepo.create.mockImplementation(async (d) => ({ id: "suite-2", ...d }));
      const created = await service.createTestSuite("owner-1", {
        name: "Payment",
        projectId: "proj-1",
      });
      expect(projectService.getProject).toHaveBeenCalledWith("owner-1", "proj-1");
      expect(created).toMatchObject({ name: "Payment", projectId: "proj-1" });
    });
  });

  describe("updateTestSuite", () => {
    it("patches only provided fields", async () => {
      suiteRepo.findById.mockResolvedValue(suite);
      suiteRepo.update.mockResolvedValue({ ...suite, name: "Renamed" });
      await service.updateTestSuite("owner-1", "suite-1", { name: "Renamed" });
      expect(suiteRepo.update).toHaveBeenCalledWith("suite-1", { name: "Renamed" });
    });
  });

  describe("deleteTestSuite", () => {
    it("soft-deletes after access checks", async () => {
      suiteRepo.findById.mockResolvedValue(suite);
      await service.deleteTestSuite("owner-1", "suite-1");
      expect(suiteRepo.softDelete).toHaveBeenCalledWith("suite-1");
    });
  });
});
