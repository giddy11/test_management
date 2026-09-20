// modules/testCase/tests/testCase.service.spec.js
const { TestCaseService } = require("../services/testCase.service");
const { ActivityService } = require("../../activity/services/activity.service");
const { TestCaseStatus } = require("../../../config/constants");
const { permissionsFor } = require("../../../test/actors");

function makeTcRepo() {
  return {
    fetchPaginated: jest.fn(),
    findById: jest.fn(),
    findAllBySuite: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
    setAssignees: jest.fn(),
    findBulkAssignable: jest.fn(),
    addAssignees: jest.fn().mockResolvedValue(undefined),
    removeAssignees: jest.fn().mockResolvedValue(undefined),
    setDeadlineForMany: jest.fn().mockResolvedValue(undefined),
    findExistingAssigneePairs: jest.fn().mockResolvedValue(new Set()),
  };
}

function makeSuiteService() {
  return {
    getTestSuite: jest.fn().mockResolvedValue({ id: "suite-1", projectId: "p-1" }),
    projectService: {
      isTeamLead: jest.fn().mockResolvedValue(false),
      canManageProject: jest.fn().mockImplementation(async (actor) => actor.role !== "user"),
      assertCanManageProject: jest.fn().mockImplementation(async (actor) => {
        if (actor.role === "user") {
          const err = new Error("Only admins or this project's team lead can do this");
          err.statusCode = 403;
          throw err;
        }
      }),
    },
  };
}

function makeAuthRepo() {
  return { findUserById: jest.fn() };
}

function makeRunResultRepo() {
  return { findBusyUserIds: jest.fn().mockResolvedValue(new Set()) };
}

const admin = { id: "owner-1", role: "admin", permissions: permissionsFor("admin"), organizationId: "org-1" };
const member = { id: "u-9", role: "user", permissions: permissionsFor("user"), organizationId: "org-1" };

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
  let runResultRepo;
  let service;

  beforeEach(() => {
    tcRepo = makeTcRepo();
    suiteService = makeSuiteService();
    authRepo = makeAuthRepo();
    runResultRepo = makeRunResultRepo();
    service = new TestCaseService(tcRepo, suiteService, authRepo, runResultRepo);
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

      const { addedUsers } = await service.assignUsers(admin, "tc-1", { userIds: ["u-9"] });

      expect(tcRepo.setAssignees).toHaveBeenCalledWith(
        expect.anything(),
        [{ id: "u-9" }]
      );
      expect(addedUsers).toHaveLength(1);
    });

    it("rejects assigning a user from another organisation", async () => {
      tcRepo.findById.mockResolvedValue({ ...testCase, assignees: [] });
      authRepo.findUserById.mockResolvedValue({ id: "u-x", organizationId: "org-2" });
      await expect(
        service.assignUsers(admin, "tc-1", { userIds: ["u-x"] })
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it("throws 404 for an unknown user", async () => {
      tcRepo.findById.mockResolvedValue({ ...testCase, assignees: [] });
      authRepo.findUserById.mockResolvedValue(null);
      await expect(
        service.assignUsers(admin, "tc-1", { userIds: ["ghost"] })
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it("rejects assigning a user who is currently executing a test run", async () => {
      tcRepo.findById.mockResolvedValue({ ...testCase, assignees: [] });
      authRepo.findUserById.mockResolvedValue({
        id: "u-9",
        firstName: "Bola",
        lastName: "Runner",
        organizationId: "org-1",
      });
      runResultRepo.findBusyUserIds.mockResolvedValue(new Set(["u-9"]));

      await expect(
        service.assignUsers(admin, "tc-1", { userIds: ["u-9"] })
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(tcRepo.setAssignees).not.toHaveBeenCalled();
    });

    it("does not re-check a user who is already assigned, even if now busy", async () => {
      // u-9 is already on the case; re-saving (e.g. just to add a deadline)
      // isn't a new distraction, so a busy status shouldn't block it.
      tcRepo.findById.mockResolvedValue({ ...testCase, assignees: [{ id: "u-9" }] });
      authRepo.findUserById.mockResolvedValue({ id: "u-9", organizationId: "org-1" });
      tcRepo.setAssignees.mockImplementation(async (tc, users) => ({ ...tc, assignees: users }));
      runResultRepo.findBusyUserIds.mockResolvedValue(new Set(["u-9"]));

      await expect(
        service.assignUsers(admin, "tc-1", { userIds: ["u-9"] })
      ).resolves.toBeTruthy();
      expect(runResultRepo.findBusyUserIds).not.toHaveBeenCalled();
      expect(tcRepo.setAssignees).toHaveBeenCalled();
    });
  });

  describe("bulkAssignUsers", () => {
    beforeEach(() => {
      authRepo.findUserById.mockImplementation(async (id) =>
        id === "owner-1" ? admin : { id, organizationId: "org-1" }
      );
      tcRepo.findBulkAssignable.mockResolvedValue([
        { id: "tc-1", title: "A", suiteId: "suite-1", suiteName: "Login", projectId: "p-1", projectName: "Web" },
        { id: "tc-2", title: "B", suiteId: "suite-1", suiteName: "Login", projectId: "p-1", projectName: "Web" },
      ]);
    });

    it("adds users across all cases in one bulk insert and logs one activity entry", async () => {
      const logSpy = jest.spyOn(ActivityService.Instance, "log").mockImplementation(() => {});

      const result = await service.bulkAssignUsers(admin, {
        caseIds: ["tc-1", "tc-2"],
        userIds: ["u-9"],
      });

      expect(tcRepo.addAssignees).toHaveBeenCalledTimes(1);
      expect(tcRepo.addAssignees).toHaveBeenCalledWith(["tc-1", "tc-2"], ["u-9"]);
      expect(tcRepo.removeAssignees).not.toHaveBeenCalled();
      expect(result).toEqual({ assignedCount: 2, mode: "add" });

      // One summarised entry for the whole bulk action, not one per case.
      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith(
        admin,
        expect.objectContaining({
          action: "test_case.assigned",
          summary: expect.stringMatching(/2 test cases in suite "Login"/),
        })
      );

      logSpy.mockRestore();
    });

    it("removes users in bulk and logs an unassigned entry (no insert)", async () => {
      const logSpy = jest.spyOn(ActivityService.Instance, "log").mockImplementation(() => {});

      const result = await service.bulkAssignUsers(admin, {
        caseIds: ["tc-1", "tc-2"],
        userIds: ["u-9"],
        mode: "remove",
      });

      expect(tcRepo.removeAssignees).toHaveBeenCalledWith(["tc-1", "tc-2"], ["u-9"]);
      expect(tcRepo.addAssignees).not.toHaveBeenCalled();
      expect(result).toEqual({ assignedCount: 2, mode: "remove" });
      expect(logSpy).toHaveBeenCalledWith(
        admin,
        expect.objectContaining({ action: "test_case.unassigned" })
      );

      logSpy.mockRestore();
    });

    it("throws 404 when none of the cases are accessible", async () => {
      tcRepo.findBulkAssignable.mockResolvedValue([]);
      await expect(
        service.bulkAssignUsers(admin, { caseIds: ["tc-x"], userIds: ["u-9"] })
      ).rejects.toMatchObject({ statusCode: 404 });
      expect(tcRepo.addAssignees).not.toHaveBeenCalled();
    });

    it("rejects bulk-adding a user who is currently executing a test run", async () => {
      runResultRepo.findBusyUserIds.mockResolvedValue(new Set(["u-9"]));

      await expect(
        service.bulkAssignUsers(admin, { caseIds: ["tc-1", "tc-2"], userIds: ["u-9"] })
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(tcRepo.addAssignees).not.toHaveBeenCalled();
    });

    it("does not block a bulk 'remove' just because the user is busy", async () => {
      runResultRepo.findBusyUserIds.mockResolvedValue(new Set(["u-9"]));

      const result = await service.bulkAssignUsers(admin, {
        caseIds: ["tc-1", "tc-2"],
        userIds: ["u-9"],
        mode: "remove",
      });

      expect(tcRepo.removeAssignees).toHaveBeenCalledWith(["tc-1", "tc-2"], ["u-9"]);
      expect(result).toEqual({ assignedCount: 2, mode: "remove" });
    });

    it("does not re-check a user already assigned to every case in the selection", async () => {
      // u-9 is already on both cases, so nothing new is being added — a busy
      // status shouldn't block re-adding them (e.g. as part of a mixed batch).
      tcRepo.findExistingAssigneePairs.mockResolvedValue(new Set(["tc-1:u-9", "tc-2:u-9"]));
      runResultRepo.findBusyUserIds.mockResolvedValue(new Set(["u-9"]));

      const result = await service.bulkAssignUsers(admin, {
        caseIds: ["tc-1", "tc-2"],
        userIds: ["u-9"],
      });

      expect(runResultRepo.findBusyUserIds).not.toHaveBeenCalled();
      expect(tcRepo.addAssignees).toHaveBeenCalledWith(["tc-1", "tc-2"], ["u-9"]);
      expect(result).toEqual({ assignedCount: 2, mode: "add" });
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
