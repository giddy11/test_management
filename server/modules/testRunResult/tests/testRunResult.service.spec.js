// modules/testRunResult/tests/testRunResult.service.spec.js
const { TestRunResultService } = require("../services/testRunResult.service");
const { permissionsFor } = require("../../../test/actors");

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
  return {
    getTestRun: jest.fn().mockResolvedValue({
      run: { id: "run-1", name: "Sprint 3", suiteId: "suite-1", projectId: "proj-1" },
      summary: {},
    }),
    suiteService: {
      projectService: {
        assertCanManageProject: jest.fn().mockImplementation(async (a) => {
          if (a.role === "user") {
            const err = new Error("Only admins or this project's team lead can do this");
            err.statusCode = 403;
            throw err;
          }
        }),
      },
    },
  };
}

function makeTcRepo() {
  return { findById: jest.fn() };
}

function makeSuiteRepo() {
  return { findById: jest.fn().mockResolvedValue({ id: "suite-1", name: "Access Management" }) };
}

function makeProjectRepo() {
  return { findById: jest.fn().mockResolvedValue({ id: "proj-1", name: "ERP" }) };
}

const result = {
  id: "res-1",
  runId: "run-1",
  testCaseId: "tc-1",
  status: null,
};

const actor = { id: "owner-1", role: "admin", permissions: permissionsFor("admin"), organizationId: "org-1" };
describe("TestRunResultService", () => {
  let resultRepo;
  let runService;
  let tcRepo;
  let suiteRepo;
  let projectRepo;
  let service;

  beforeEach(() => {
    resultRepo = makeResultRepo();
    runService = makeRunService();
    tcRepo = makeTcRepo();
    suiteRepo = makeSuiteRepo();
    projectRepo = makeProjectRepo();
    service = new TestRunResultService(resultRepo, runService, tcRepo, suiteRepo, projectRepo);
  });

  describe("fetchResults", () => {
    it("verifies run access then delegates to the repo", async () => {
      resultRepo.fetchPaginated.mockResolvedValue({ data: [result], meta: {} });
      await service.fetchResults(actor, { runId: "run-1", page: 1, limit: 20 });
      expect(runService.getTestRun).toHaveBeenCalledWith(actor, "run-1");
      expect(resultRepo.fetchPaginated).toHaveBeenCalled();
    });
  });

  describe("getResult", () => {
    it("throws 404 when the result is missing", async () => {
      resultRepo.findById.mockResolvedValue(null);
      await expect(service.getResult(actor, "res-1")).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  describe("createResult", () => {
    it("validates the run and the test case before creating", async () => {
      tcRepo.findById.mockResolvedValue({ id: "tc-1", deletedAt: null });
      resultRepo.create.mockImplementation(async (d) => ({ id: "res-2", ...d }));
      const created = await service.createResult(actor, {
        runId: "run-1",
        testCaseId: "tc-1",
      });
      expect(created).toMatchObject({ runId: "run-1", testCaseId: "tc-1", status: null });
    });

    it("throws 404 when the test case does not exist", async () => {
      tcRepo.findById.mockResolvedValue(null);
      await expect(
        service.createResult(actor, { runId: "run-1", testCaseId: "ghost" })
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe("recordResult", () => {
    it("sets status, executor and executedAt when a status is given", async () => {
      resultRepo.findById.mockResolvedValue(result);
      resultRepo.update.mockImplementation(async (_id, patch) => ({ ...result, ...patch }));

      await service.recordResult(actor, "res-1", { status: "pass", notes: "ok" });

      const patch = resultRepo.update.mock.calls[0][1];
      expect(patch.status).toBe("pass");
      expect(patch.executedById).toBe("owner-1");
      expect(patch.executedAt).toBeInstanceOf(Date);
      expect(patch.notes).toBe("ok");
    });

    it("logs an activity summary naming the case, suite, project and run", async () => {
      const { ActivityService } = require("../../activity/services/activity.service");
      const spy = jest.spyOn(ActivityService.Instance, "log").mockImplementation(() => {});
      resultRepo.findById.mockResolvedValue(result);
      resultRepo.update.mockImplementation(async (_id, patch) => ({ ...result, ...patch }));
      tcRepo.findById.mockResolvedValue({ id: "tc-1", title: "ERP Access - HR Officer" });

      await service.recordResult(actor, "res-1", { status: "pass" });

      expect(spy).toHaveBeenCalledWith(
        actor,
        expect.objectContaining({
          summary:
            'Recorded "pass" on "ERP Access - HR Officer" in suite "Access Management" (project "ERP", run "Sprint 3")',
        })
      );
      spy.mockRestore();
    });

    it("does not stamp executor when only notes change", async () => {
      resultRepo.findById.mockResolvedValue(result);
      resultRepo.update.mockImplementation(async (_id, patch) => ({ ...result, ...patch }));

      await service.recordResult(actor, "res-1", { notes: "later" });

      const patch = resultRepo.update.mock.calls[0][1];
      expect(patch.executedById).toBeUndefined();
      expect(patch.executedAt).toBeUndefined();
    });
  });

  describe("deleteResult", () => {
    it("deletes after access checks", async () => {
      resultRepo.findById.mockResolvedValue(result);
      await service.deleteResult(actor, "res-1");
      expect(resultRepo.delete).toHaveBeenCalledWith("res-1");
    });
  });
});
