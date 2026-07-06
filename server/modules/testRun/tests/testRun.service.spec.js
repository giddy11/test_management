// modules/testRun/tests/testRun.service.spec.js
const { TestRunService } = require("../services/testRun.service");

function makeRunRepo() {
  return {
    fetchPaginated: jest.fn(),
    findById: jest.fn(),
    findActiveByProject: jest.fn().mockResolvedValue([]),
    findActiveBySuite: jest.fn().mockResolvedValue(null),
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

    it("throws 409 when the suite already has an in-progress run", async () => {
      runRepo.findActiveBySuite.mockResolvedValue({ id: "run-existing" });
      await expect(
        service.createTestRun(actor, {
          name: "x",
          projectId: "proj-1",
          suiteId: "suite-1",
        })
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(runRepo.create).not.toHaveBeenCalled();
      expect(runRepo.findActiveBySuite).toHaveBeenCalledWith("suite-1");
    });
  });

  describe("fetchTestRuns", () => {
    it("scopes to the actor's own runs for the 'user' role", async () => {
      runRepo.fetchPaginated.mockResolvedValue({ data: [], meta: {} });
      const regularUser = { id: "user-1", role: "user", organizationId: "org-1" };
      await service.fetchTestRuns(regularUser, { projectId: "proj-1" });
      expect(runRepo.fetchPaginated).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: "proj-1", restrictToUserId: "user-1" })
      );
    });

    it("does not scope by user for admins", async () => {
      runRepo.fetchPaginated.mockResolvedValue({ data: [], meta: {} });
      await service.fetchTestRuns(actor, { projectId: "proj-1" });
      expect(runRepo.fetchPaginated).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: "proj-1", restrictToUserId: undefined })
      );
    });
  });

  describe("getActiveRunStatus", () => {
    it("returns the suite ids that have an in-progress run", async () => {
      runRepo.findActiveByProject.mockResolvedValue([
        { id: "run-1", suiteId: "suite-1" },
        { id: "run-2", suiteId: "suite-2" },
      ]);
      const result = await service.getActiveRunStatus(actor, "proj-1");
      expect(result).toEqual({ activeSuiteIds: ["suite-1", "suite-2"] });
    });

    it("returns an empty list when no run is in progress", async () => {
      runRepo.findActiveByProject.mockResolvedValue([]);
      const result = await service.getActiveRunStatus(actor, "proj-1");
      expect(result).toEqual({ activeSuiteIds: [] });
    });
  });

  describe("getTestRun", () => {
    it("returns the run-wide status summary for admins", async () => {
      runRepo.findById.mockResolvedValue(run);
      resultRepo.statusSummary.mockResolvedValue({ total: 3, pass: 1 });
      const result = await service.getTestRun(actor, "run-1");
      expect(result.run).toBe(run);
      expect(result.summary).toEqual({ total: 3, pass: 1 });
      expect(resultRepo.statusSummary).toHaveBeenCalledWith("run-1", undefined);
    });

    it("scopes the status summary to the actor's assigned cases for the 'user' role", async () => {
      runRepo.findById.mockResolvedValue(run);
      resultRepo.statusSummary.mockResolvedValue({ total: 1, pass: 0 });
      const regularUser = { id: "user-1", role: "user", organizationId: "org-1" };
      const result = await service.getTestRun(regularUser, "run-1");
      expect(result.summary).toEqual({ total: 1, pass: 0 });
      expect(resultRepo.statusSummary).toHaveBeenCalledWith("run-1", "user-1");
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
