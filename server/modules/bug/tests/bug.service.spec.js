// modules/bug/tests/bug.service.spec.js
const { BugService } = require("../services/bug.service");

function makeBugRepo() {
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
    getProject: jest.fn().mockResolvedValue({ id: "proj-1", organizationId: "org-1" }),
    // Default mimics the real rule: admins pass, plain users don't (override
    // canManageProject/assertCanManageProject in team-lead tests).
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

function makeAuthRepo() {
  return {
    findByRole: jest.fn().mockResolvedValue([]),
    findByRoleAndOrg: jest.fn().mockResolvedValue([]),
    findUserById: jest.fn().mockResolvedValue(null),
  };
}

function makeTestCaseRepo() {
  return { findById: jest.fn() };
}

function makeTestSuiteRepo() {
  return { findById: jest.fn() };
}

function makeTestRunRepo() {
  return { findById: jest.fn() };
}

function makeNotificationService() {
  return {
    notifyNewBug: jest.fn(),
    notifyBugStatusChanged: jest.fn(),
    notifyBugAssigned: jest.fn(),
  };
}

function makeMemberRepo() {
  return { findMemberUsers: jest.fn().mockResolvedValue([]) };
}

const admin = { id: "admin-1", role: "admin", organizationId: "org-1" };
const user = { id: "user-1", role: "user", organizationId: "org-1" };

const bug = {
  id: "bug-1",
  projectId: "proj-1",
  title: "Login button broken",
  description: "Clicking does nothing",
  status: "Open",
  severity: "Minor",
  priority: "Medium",
  testCaseId: null,
  testRunId: null,
  reportedById: "user-1",
  assignedToId: null,
  resolvedAt: null,
  closedAt: null,
  deletedAt: null,
};

describe("BugService", () => {
  let bugRepo, projectService, authRepo, testCaseRepo, testSuiteRepo, testRunRepo, notificationService, memberRepo, service;

  beforeEach(() => {
    bugRepo = makeBugRepo();
    projectService = makeProjectService();
    authRepo = makeAuthRepo();
    testCaseRepo = makeTestCaseRepo();
    testSuiteRepo = makeTestSuiteRepo();
    testRunRepo = makeTestRunRepo();
    notificationService = makeNotificationService();
    memberRepo = makeMemberRepo();
    service = new BugService(
      bugRepo,
      projectService,
      authRepo,
      testCaseRepo,
      testSuiteRepo,
      testRunRepo,
      notificationService,
      memberRepo
    );
  });

  describe("getAccessible / getBug", () => {
    it("throws 404 when missing", async () => {
      bugRepo.findById.mockResolvedValue(null);
      await expect(service.getBug(user, "bug-1")).rejects.toMatchObject({ statusCode: 404 });
    });

    it("throws 404 when soft-deleted", async () => {
      bugRepo.findById.mockResolvedValue({ ...bug, deletedAt: new Date() });
      await expect(service.getBug(user, "bug-1")).rejects.toMatchObject({ statusCode: 404 });
    });

    it("checks project access via the bug's projectId", async () => {
      bugRepo.findById.mockResolvedValue(bug);
      await expect(service.getBug(user, "bug-1")).resolves.toBe(bug);
      expect(projectService.getProject).toHaveBeenCalledWith(user, "proj-1");
    });
  });

  describe("fetchBugs", () => {
    it("checks project access then delegates to the repo", async () => {
      bugRepo.fetchPaginated.mockResolvedValue({ data: [bug], meta: { page: 1 } });
      const result = await service.fetchBugs(user, { projectId: "proj-1", page: 1, limit: 20 });
      expect(projectService.getProject).toHaveBeenCalledWith(user, "proj-1");
      expect(result.data).toEqual([bug]);
    });
  });

  describe("createBug", () => {
    it("checks project access then creates with status Open and reportedById", async () => {
      bugRepo.create.mockResolvedValue({ ...bug, id: "bug-2" });
      bugRepo.findById.mockResolvedValue({ ...bug, id: "bug-2" });
      const created = await service.createBug(user, {
        projectId: "proj-1",
        title: "Login button broken",
        description: "Clicking does nothing",
        severity: "Minor",
        priority: "Medium",
      });
      expect(projectService.getProject).toHaveBeenCalledWith(user, "proj-1");
      expect(bugRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: "proj-1", status: "Open", reportedById: "user-1" })
      );
      expect(created.id).toBe("bug-2");
    });

    it("throws 404 when the linked test case doesn't exist", async () => {
      testCaseRepo.findById.mockResolvedValue(null);
      await expect(
        service.createBug(user, {
          projectId: "proj-1",
          title: "x",
          description: "y",
          severity: "Minor",
          priority: "Medium",
          testCaseId: "case-1",
        })
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it("throws 422 when the linked test case belongs to a different project", async () => {
      testCaseRepo.findById.mockResolvedValue({ id: "case-1", suiteId: "suite-1" });
      testSuiteRepo.findById.mockResolvedValue({ id: "suite-1", projectId: "proj-other" });
      await expect(
        service.createBug(user, {
          projectId: "proj-1",
          title: "x",
          description: "y",
          severity: "Minor",
          priority: "Medium",
          testCaseId: "case-1",
        })
      ).rejects.toMatchObject({ statusCode: 422 });
    });

    it("throws 422 when the linked test run belongs to a different project", async () => {
      testRunRepo.findById.mockResolvedValue({ id: "run-1", projectId: "proj-other" });
      await expect(
        service.createBug(user, {
          projectId: "proj-1",
          title: "x",
          description: "y",
          severity: "Minor",
          priority: "Medium",
          testRunId: "run-1",
        })
      ).rejects.toMatchObject({ statusCode: 422 });
    });

    it("accepts a test run that belongs to the same project", async () => {
      testRunRepo.findById.mockResolvedValue({ id: "run-1", projectId: "proj-1" });
      bugRepo.create.mockResolvedValue({ ...bug, testRunId: "run-1" });
      bugRepo.findById.mockResolvedValue({ ...bug, testRunId: "run-1" });
      const created = await service.createBug(user, {
        projectId: "proj-1",
        title: "x",
        description: "y",
        severity: "Minor",
        priority: "Medium",
        testRunId: "run-1",
      });
      expect(created.testRunId).toBe("run-1");
    });
  });

  describe("manageBug", () => {
    it("forbids a plain user (non team-lead) from managing", async () => {
      bugRepo.findById.mockResolvedValue(bug);
      await expect(service.manageBug(user, "bug-1", { status: "Fixed" })).rejects.toMatchObject({
        statusCode: 403,
      });
      expect(bugRepo.update).not.toHaveBeenCalled();
    });

    it("allows a team lead of the project to manage", async () => {
      projectService.assertCanManageProject.mockResolvedValue(undefined);
      bugRepo.findById.mockResolvedValue(bug);
      bugRepo.update.mockResolvedValue({ ...bug, status: "Fixed" });
      await service.manageBug(user, "bug-1", { status: "Fixed" });
      expect(bugRepo.update).toHaveBeenCalled();
    });

    it("throws 404 when missing", async () => {
      bugRepo.findById.mockResolvedValue(null);
      await expect(service.manageBug(admin, "bug-1", { status: "Fixed" })).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it("stamps resolvedAt the first time status becomes Fixed", async () => {
      bugRepo.findById.mockResolvedValue(bug);
      bugRepo.update.mockResolvedValue({ ...bug, status: "Fixed" });
      await service.manageBug(admin, "bug-1", { status: "Fixed" });
      expect(bugRepo.update).toHaveBeenCalledWith(
        "bug-1",
        expect.objectContaining({ status: "Fixed", resolvedAt: expect.any(Date) })
      );
    });

    it("stamps closedAt when status becomes Closed", async () => {
      bugRepo.findById.mockResolvedValue(bug);
      bugRepo.update.mockResolvedValue({ ...bug, status: "Closed" });
      await service.manageBug(admin, "bug-1", { status: "Closed" });
      expect(bugRepo.update).toHaveBeenCalledWith(
        "bug-1",
        expect.objectContaining({ status: "Closed", closedAt: expect.any(Date) })
      );
    });

    it("clears resolvedAt/closedAt when reopened", async () => {
      const fixedBug = { ...bug, status: "Closed", resolvedAt: new Date(), closedAt: new Date() };
      bugRepo.findById.mockResolvedValue(fixedBug);
      bugRepo.update.mockResolvedValue({ ...fixedBug, status: "Reopened" });
      await service.manageBug(admin, "bug-1", { status: "Reopened" });
      expect(bugRepo.update).toHaveBeenCalledWith(
        "bug-1",
        expect.objectContaining({ status: "Reopened", resolvedAt: null, closedAt: null })
      );
    });

    it("notifies the reporter on status change", async () => {
      bugRepo.findById.mockResolvedValue(bug);
      bugRepo.update.mockResolvedValue({ ...bug, status: "In Progress" });
      authRepo.findUserById.mockResolvedValue({ id: "user-1", email: "u@x.com", firstName: "U" });
      await service.manageBug(admin, "bug-1", { status: "In Progress" });
      await Promise.resolve();
      expect(notificationService.notifyBugStatusChanged).toHaveBeenCalled();
    });

    it("notifies the new assignee on assignment change", async () => {
      bugRepo.findById.mockResolvedValue(bug);
      bugRepo.update.mockResolvedValue({ ...bug, assignedToId: "dev-1" });
      authRepo.findUserById.mockResolvedValue({ id: "dev-1", email: "d@x.com", firstName: "D" });
      await service.manageBug(admin, "bug-1", { assignedToId: "dev-1" });
      await Promise.resolve();
      expect(notificationService.notifyBugAssigned).toHaveBeenCalled();
    });
  });

  describe("deleteBug", () => {
    it("forbids a plain user (non team-lead)", async () => {
      bugRepo.findById.mockResolvedValue(bug);
      await expect(service.deleteBug(user, "bug-1")).rejects.toMatchObject({ statusCode: 403 });
      expect(bugRepo.softDelete).not.toHaveBeenCalled();
    });

    it("soft-deletes after access checks for an admin", async () => {
      bugRepo.findById.mockResolvedValue(bug);
      await service.deleteBug(admin, "bug-1");
      expect(projectService.getProject).toHaveBeenCalledWith(admin, "proj-1");
      expect(bugRepo.softDelete).toHaveBeenCalledWith("bug-1");
    });
  });
});
