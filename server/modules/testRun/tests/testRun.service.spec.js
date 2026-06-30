// modules/testRun/tests/testRun.service.spec.js
const { TestRunService } = require("../services/testRun.service");

function makeRunRepo() {
  return {
    fetchPaginated: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
}

function makeResultRepo() {
  return {
    createMany: jest.fn().mockResolvedValue([]),
    statusSummary: jest.fn().mockResolvedValue({ total: 0 }),
  };
}

function makeTcRepo() {
  return { findAllBySuite: jest.fn().mockResolvedValue([]) };
}

function makeSuiteService() {
  return {
    getTestSuite: jest.fn().mockResolvedValue({ id: "suite-1", projectId: "proj-1" }),
    projectService: { getProject: jest.fn().mockResolvedValue({ id: "proj-1" }) },
  };
}

const actor = { id: "owner-1", role: "admin", organizationId: "org-1" };
const run = { id: "run-1", name: "Sprint 3", projectId: "proj-1", suiteId: "suite-1" };

describe("TestRunService", () => {
  let runRepo;
  let resultRepo;
  let tcRepo;
  let suiteService;
  let service;

  beforeEach(() => {
    runRepo = makeRunRepo();
    resultRepo = makeResultRepo();
    tcRepo = makeTcRepo();
    suiteService = makeSuiteService();
    service = new TestRunService(runRepo, resultRepo, tcRepo, suiteService);
  });

  describe("createTestRun", () => {
    it("snapshots every case in the suite into pending results", async () => {
      runRepo.create.mockResolvedValue(run);
      tcRepo.findAllBySuite.mockResolvedValue([{ id: "tc-1" }, { id: "tc-2" }]);
      resultRepo.statusSummary.mockResolvedValue({ total: 2, pending: 2 });

      const result = await service.createTestRun(actor, {
        name: "Sprint 3",
        projectId: "proj-1",
        suiteId: "suite-1",
      });

      expect(runRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: "proj-1", createdById: "owner-1" })
      );
      expect(resultRepo.createMany).toHaveBeenCalledWith([
        { runId: "run-1", testCaseId: "tc-1", status: null },
        { runId: "run-1", testCaseId: "tc-2", status: null },
      ]);
      expect(result.summary).toEqual({ total: 2, pending: 2 });
    });

    it("throws 400 when the suite does not belong to the project", async () => {
      suiteService.getTestSuite.mockResolvedValue({ id: "suite-1", projectId: "other" });
      await expect(
        service.createTestRun(actor, {
          name: "x",
          projectId: "proj-1",
          suiteId: "suite-1",
        })
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(runRepo.create).not.toHaveBeenCalled();
    });
  });

  describe("getTestRun", () => {
    it("returns the run with its status summary", async () => {
      runRepo.findById.mockResolvedValue(run);
      resultRepo.statusSummary.mockResolvedValue({ total: 3, pass: 1 });
      const result = await service.getTestRun(actor, "run-1");
      expect(result.run).toBe(run);
      expect(result.summary).toEqual({ total: 3, pass: 1 });
    });

    it("throws 404 when the run is missing", async () => {
      runRepo.findById.mockResolvedValue(null);
      await expect(service.getTestRun(actor, "run-1")).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  describe("updateTestRun", () => {
    it("patches the run and returns a fresh summary", async () => {
      runRepo.findById.mockResolvedValue(run);
      runRepo.update.mockResolvedValue({ ...run, status: "completed" });
      const { run: updated } = await service.updateTestRun(actor, "run-1", {
        status: "completed",
      });
      expect(runRepo.update).toHaveBeenCalledWith("run-1", { status: "completed" });
      expect(updated.status).toBe("completed");
    });
  });

  describe("deleteTestRun", () => {
    it("deletes after access checks", async () => {
      runRepo.findById.mockResolvedValue(run);
      await service.deleteTestRun(actor, "run-1");
      expect(runRepo.delete).toHaveBeenCalledWith("run-1");
    });
  });
});
