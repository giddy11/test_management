// modules/testCase/tests/testCase.service.spec.js
const { TestCaseService } = require("../services/testCase.service");
const { ActivityService } = require("../../activity/services/activity.service");
const { TestCaseStatus } = require("../../../config/constants");

function makeTcRepo() {
  return {
    fetchPaginated: jest.fn(),
    findById: jest.fn(),
    findAllBySuite: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
    setAssignees: jest.fn(),
  };
}

function makeSuiteService() {
  return { getTestSuite: jest.fn().mockResolvedValue({ id: "suite-1", projectId: "p-1" }) };
}

function makeAuthRepo() {
  return { findUserById: jest.fn() };
}

const admin = { id: "owner-1", role: "admin", organizationId: "org-1" };
const member = { id: "u-9", role: "user", organizationId: "org-1" };

const testCase = {
  id: "tc-1",
  title: "Login works",
  suiteId: "suite-1",
  status: TestCaseStatus.DRAFT,
  deletedAt: null,
  assignees: [],
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
    it("checks suite access and maps `suite` to `suiteId` (admin sees all)", async () => {
      tcRepo.fetchPaginated.mockResolvedValue({ data: [testCase], meta: {} });
      await service.fetchTestCases(admin, { suite: "suite-1", page: 1, limit: 20 });
      expect(suiteService.getTestSuite).toHaveBeenCalledWith(admin, "suite-1");
      expect(tcRepo.fetchPaginated).toHaveBeenCalledWith(
        expect.objectContaining({ suiteId: "suite-1", assigneeId: undefined })
      );
    });

    it("scopes a 'user' to cases assigned to them", async () => {
      tcRepo.fetchPaginated.mockResolvedValue({ data: [], meta: {} });
      await service.fetchTestCases(member, { suite: "suite-1", page: 1, limit: 20 });
      expect(tcRepo.fetchPaginated).toHaveBeenCalledWith(
        expect.objectContaining({ assigneeId: "u-9" })
      );
    });
  });

  describe("createTestCase", () => {
    it("creates with defaults and the actor as creator", async () => {
      tcRepo.create.mockImplementation(async (d) => ({ id: "tc-2", ...d }));
      const created = await service.createTestCase(admin, {
        title: "T",
        steps: ["a", "b"],
        expectedResult: "ok",
        priority: "High",
        suite: "suite-1",
        tags: ["smoke"],
      });
      const payload = tcRepo.create.mock.calls[0][0];
      expect(payload.suiteId).toBe("suite-1");
      expect(payload.status).toBe(TestCaseStatus.DRAFT);
      expect(payload.createdById).toBe("owner-1");
      expect(created.id).toBe("tc-2");
    });
  });

  describe("getTestCase", () => {
    it("throws 404 when missing", async () => {
      tcRepo.findById.mockResolvedValue(null);
      await expect(service.getTestCase(admin, "tc-1")).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it("hides an unassigned case from a 'user' (404)", async () => {
      tcRepo.findById.mockResolvedValue({ ...testCase, assignees: [{ id: "someone-else" }] });
      await expect(service.getTestCase(member, "tc-1")).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it("lets a 'user' see a case assigned to them", async () => {
      tcRepo.findById.mockResolvedValue({ ...testCase, assignees: [{ id: "u-9" }] });
      await expect(service.getTestCase(member, "tc-1")).resolves.toBeTruthy();
    });
  });

  describe("assignUsers", () => {
    it("replaces the assignee set with org users", async () => {
      tcRepo.findById.mockResolvedValue({ ...testCase, assignees: [] });
      authRepo.findUserById.mockResolvedValue({ id: "u-9", organizationId: "org-1" });
      tcRepo.setAssignees.mockImplementation(async (tc, users) => ({ ...tc, assignees: users }));

      const { addedUsers } = await service.assignUsers(admin, "tc-1", ["u-9"]);

      expect(tcRepo.setAssignees).toHaveBeenCalledWith(
        expect.anything(),
        [{ id: "u-9" }]
      );
      expect(addedUsers).toHaveLength(1);
    });

    it("rejects assigning a user from another organisation", async () => {
      tcRepo.findById.mockResolvedValue({ ...testCase, assignees: [] });
      authRepo.findUserById.mockResolvedValue({ id: "u-x", organizationId: "org-2" });
      await expect(service.assignUsers(admin, "tc-1", ["u-x"])).rejects.toMatchObject({
        statusCode: 403,
      });
    });

    it("throws 404 for an unknown user", async () => {
      tcRepo.findById.mockResolvedValue({ ...testCase, assignees: [] });
      authRepo.findUserById.mockResolvedValue(null);
      await expect(service.assignUsers(admin, "tc-1", ["ghost"])).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  describe("bulkAssignUsers", () => {
    it("merges assignees per case and logs exactly one activity entry", async () => {
      const logSpy = jest.spyOn(ActivityService.Instance, "log").mockImplementation(() => {});

      tcRepo.findById.mockImplementation(async (id) =>
        id === "tc-1"
          ? { ...testCase, id: "tc-1", assignees: [{ id: "existing-1" }] }
          : { ...testCase, id: "tc-2", assignees: [] }
      );
      authRepo.findUserById.mockImplementation(async (id) =>
        id === "owner-1" ? admin : { id, organizationId: "org-1" }
      );
      tcRepo.setAssignees.mockImplementation(async (tc, users) => ({ ...tc, assignees: users }));

      const result = await service.bulkAssignUsers(admin, {
        caseIds: ["tc-1", "tc-2"],
        userIds: ["u-9"],
      });

      expect(tcRepo.setAssignees).toHaveBeenCalledTimes(2);
      expect(tcRepo.setAssignees).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ id: "tc-1" }),
        expect.arrayContaining([{ id: "existing-1" }, { id: "u-9" }])
      );
      expect(result).toEqual({ assignedCount: 2 });

      // One summarised entry for the whole bulk action, not one per case.
      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith(
        admin,
        expect.objectContaining({
          action: "test_case.assigned",
          summary: expect.stringContaining("2 test cases"),
        })
      );

      logSpy.mockRestore();
    });
  });

  describe("deleteTestCase", () => {
    it("soft-deletes after access checks", async () => {
      tcRepo.findById.mockResolvedValue(testCase);
      await service.deleteTestCase(admin, "tc-1");
      expect(tcRepo.softDelete).toHaveBeenCalledWith("tc-1");
    });
  });
});
