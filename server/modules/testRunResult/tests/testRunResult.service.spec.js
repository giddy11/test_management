// modules/testRunResult/tests/testRunResult.service.spec.js
const { TestRunResultService } = require("../services/testRunResult.service");

function makeResultRepo() {
  return {
    fetchPaginated: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
}

function makeRunService() {
  return { getTestRun: jest.fn().mockResolvedValue({ run: { id: "run-1" }, summary: {} }) };
}

function makeTcRepo() {
  return { findById: jest.fn() };
}

const result = {
  id: "res-1",
  runId: "run-1",
  testCaseId: "tc-1",
  status: null,
};

describe("TestRunResultService", () => {
  let resultRepo;
  let runService;
  let tcRepo;
  let service;

  beforeEach(() => {
    resultRepo = makeResultRepo();
    runService = makeRunService();
    tcRepo = makeTcRepo();
    service = new TestRunResultService(resultRepo, runService, tcRepo);
  });

  describe("fetchResults", () => {
    it("verifies run access then delegates to the repo", async () => {
      resultRepo.fetchPaginated.mockResolvedValue({ data: [result], meta: {} });
      await service.fetchResults("owner-1", { runId: "run-1", page: 1, limit: 20 });
      expect(runService.getTestRun).toHaveBeenCalledWith("owner-1", "run-1");
      expect(resultRepo.fetchPaginated).toHaveBeenCalled();
    });
  });

  describe("getResult", () => {
    it("throws 404 when the result is missing", async () => {
      resultRepo.findById.mockResolvedValue(null);
      await expect(service.getResult("owner-1", "res-1")).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  describe("createResult", () => {
    it("validates the run and the test case before creating", async () => {
      tcRepo.findById.mockResolvedValue({ id: "tc-1", deletedAt: null });
      resultRepo.create.mockImplementation(async (d) => ({ id: "res-2", ...d }));
      const created = await service.createResult("owner-1", {
        runId: "run-1",
        testCaseId: "tc-1",
      });
      expect(created).toMatchObject({ runId: "run-1", testCaseId: "tc-1", status: null });
    });

    it("throws 404 when the test case does not exist", async () => {
      tcRepo.findById.mockResolvedValue(null);
      await expect(
        service.createResult("owner-1", { runId: "run-1", testCaseId: "ghost" })
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe("recordResult", () => {
    it("sets status, executor and executedAt when a status is given", async () => {
      resultRepo.findById.mockResolvedValue(result);
      resultRepo.update.mockImplementation(async (_id, patch) => ({ ...result, ...patch }));

      await service.recordResult("owner-1", "res-1", { status: "pass", notes: "ok" });

      const patch = resultRepo.update.mock.calls[0][1];
      expect(patch.status).toBe("pass");
      expect(patch.executedById).toBe("owner-1");
      expect(patch.executedAt).toBeInstanceOf(Date);
      expect(patch.notes).toBe("ok");
    });

    it("does not stamp executor when only notes change", async () => {
      resultRepo.findById.mockResolvedValue(result);
      resultRepo.update.mockImplementation(async (_id, patch) => ({ ...result, ...patch }));

      await service.recordResult("owner-1", "res-1", { notes: "later" });

      const patch = resultRepo.update.mock.calls[0][1];
      expect(patch.executedById).toBeUndefined();
      expect(patch.executedAt).toBeUndefined();
    });
  });

  describe("deleteResult", () => {
    it("deletes after access checks", async () => {
      resultRepo.findById.mockResolvedValue(result);
      await service.deleteResult("owner-1", "res-1");
      expect(resultRepo.delete).toHaveBeenCalledWith("res-1");
    });
  });
});
