// modules/testCase/tests/testCase.service.spec.js
const { TestCaseService } = require("../services/testCase.service");
const { TestCaseStatus } = require("../../../config/constants");

function makeTcRepo() {
  return {
    fetchPaginated: jest.fn(),
    findById: jest.fn(),
    findAllBySuite: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
  };
}

function makeSuiteService() {
  return { getTestSuite: jest.fn().mockResolvedValue({ id: "suite-1", projectId: "p-1" }) };
}

function makeAuthRepo() {
  return { findUserById: jest.fn() };
}

const testCase = {
  id: "tc-1",
  title: "Login works",
  suiteId: "suite-1",
  status: TestCaseStatus.DRAFT,
  deletedAt: null,
};

describe("TestCaseService", () => {
  let tcRepo;
  let suiteService;
  let authRepo;
  let service;

  beforeEach(() => {
    tcRepo = makeTcRepo();
    suiteService = makeSuiteService();
    authRepo = makeAuthRepo();
    service = new TestCaseService(tcRepo, suiteService, authRepo);
  });

  describe("fetchTestCases", () => {
    it("checks suite access and maps `suite` to `suiteId`", async () => {
      tcRepo.fetchPaginated.mockResolvedValue({ data: [testCase], meta: {} });
      await service.fetchTestCases("owner-1", { suite: "suite-1", page: 1, limit: 20 });
      expect(suiteService.getTestSuite).toHaveBeenCalledWith("owner-1", "suite-1");
      expect(tcRepo.fetchPaginated).toHaveBeenCalledWith(
        expect.objectContaining({ suiteId: "suite-1" })
      );
    });
  });

  describe("createTestCase", () => {
    it("creates with defaults and maps fields from the DTO", async () => {
      tcRepo.create.mockImplementation(async (d) => ({ id: "tc-2", ...d }));
      const created = await service.createTestCase("owner-1", {
        title: "T",
        steps: ["a", "b"],
        expectedResult: "ok",
        priority: "High",
        suite: "suite-1",
        tags: ["smoke"],
      });
      const payload = tcRepo.create.mock.calls[0][0];
      expect(payload.suiteId).toBe("suite-1");
      expect(payload.status).toBe(TestCaseStatus.DRAFT); // default applied
      expect(payload.createdById).toBe("owner-1");
      expect(created.id).toBe("tc-2");
    });

    it("throws 404 when the assigned user does not exist", async () => {
      authRepo.findUserById.mockResolvedValue(null);
      await expect(
        service.createTestCase("owner-1", {
          title: "T",
          steps: ["a"],
          expectedResult: "ok",
          priority: "Low",
          suite: "suite-1",
          assignedTo: "ghost",
        })
      ).rejects.toMatchObject({ statusCode: 404 });
      expect(tcRepo.create).not.toHaveBeenCalled();
    });
  });

  describe("getTestCase", () => {
    it("throws 404 when missing", async () => {
      tcRepo.findById.mockResolvedValue(null);
      await expect(service.getTestCase("owner-1", "tc-1")).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  describe("updateTestCase", () => {
    it("maps assignedTo to assignedToId and patches", async () => {
      tcRepo.findById.mockResolvedValue(testCase);
      authRepo.findUserById.mockResolvedValue({ id: "u-9" });
      tcRepo.update.mockResolvedValue({ ...testCase, assignedToId: "u-9" });

      await service.updateTestCase("owner-1", "tc-1", { assignedTo: "u-9", priority: "Critical" });

      expect(tcRepo.update).toHaveBeenCalledWith(
        "tc-1",
        expect.objectContaining({ assignedToId: "u-9", priority: "Critical" })
      );
    });
  });

  describe("deleteTestCase", () => {
    it("soft-deletes after access checks", async () => {
      tcRepo.findById.mockResolvedValue(testCase);
      await service.deleteTestCase("owner-1", "tc-1");
      expect(tcRepo.softDelete).toHaveBeenCalledWith("tc-1");
    });
  });
});
