// modules/bug/tests/bug.service.spec.js
const { BugService } = require("../services/bug.service");
const { permissionsFor } = require("../../../test/actors");

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
    // Anyone on the project can take part; override to reject for a read-only viewer.
    assertCanContribute: jest.fn().mockResolvedValue(undefined),
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

function makeHistoryRepo() {
  return { create: jest.fn().mockResolvedValue(undefined) };
}

const admin = { id: "admin-1", role: "admin", permissions: permissionsFor("admin"), organizationId: "org-1" };
// A plain member who leads the project: under the old model that is who
// could triage its bugs, so they migrate to Test lead, not QA engineer.
const user = {
  id: "user-1",
  role: "user",
  permissions: permissionsFor("user", false, true),
  organizationId: "org-1",
};
// A plain member who leads nothing — can report and edit, never triage.
const reporter = {
  id: "user-2",
  role: "user",
  permissions: permissionsFor("user"),
  organizationId: "org-1",
};

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
  let bugRepo, projectService, authRepo, testCaseRepo, testSuiteRepo, testRunRepo, notificationService, memberRepo, historyRepo, service;

  beforeEach(() => {
    bugRepo = makeBugRepo();
    projectService = makeProjectService();
    authRepo = makeAuthRepo();
    testCaseRepo = makeTestCaseRepo();
    testSuiteRepo = makeTestSuiteRepo();
    testRunRepo = makeTestRunRepo();
    notificationService = makeNotificationService();
    memberRepo = makeMemberRepo();
    historyRepo = makeHistoryRepo();
    service = new BugService(
      bugRepo,
      projectService,
      authRepo,
      testCaseRepo,
      testSuiteRepo,
      testRunRepo,
      notificationService,
      memberRepo,
      historyRepo
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

    it("seeds bug_status_history with the Open stage at creation", async () => {
      const createdAt = new Date("2026-01-01T00:00:00Z");
      bugRepo.create.mockResolvedValue({ ...bug, id: "bug-2", createdAt });
      bugRepo.findById.mockResolvedValue({ ...bug, id: "bug-2", createdAt });
      await service.createBug(user, {
        projectId: "proj-1",
        title: "Login button broken",
        description: "Clicking does nothing",
        severity: "Minor",
        priority: "Medium",
      });
      await Promise.resolve();
      expect(historyRepo.create).toHaveBeenCalledWith({ bugId: "bug-2", status: "Open", enteredAt: createdAt });
    });
  });

  describe("manageBug", () => {
    // Separation of duties: reporting a bug and signing off its fix are
    // different privileges, so the person who raised it can never verify it.
    it("lets the reporter correct their own report but not triage it", async () => {
      // The reporter is a plain project member, so it is the PROJECT bar that
      // stops them: assertCanManageProject rejects anyone who is not the lead.
      const ownBug = { ...bug, reportedById: reporter.id };
      bugRepo.findById.mockResolvedValue(ownBug);
      bugRepo.update.mockResolvedValue(ownBug);

      await service.manageBug(reporter, "bug-1", { title: "Clearer title" });
      expect(bugRepo.update).toHaveBeenCalled();

      bugRepo.update.mockClear();
      await expect(
        service.manageBug(reporter, "bug-1", { severity: "Critical" })
      ).rejects.toMatchObject({ statusCode: 403 });
      await expect(
        service.manageBug(reporter, "bug-1", { status: "Verified" })
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(bugRepo.update).not.toHaveBeenCalled();
    });

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

    it.each(["Verified", "Closed"])(
      "stamps resolvedAt when a bug skips straight to %s without ever being Fixed",
      async (status) => {
        bugRepo.findById.mockResolvedValue(bug);
        bugRepo.update.mockResolvedValue({ ...bug, status });
        await service.manageBug(admin, "bug-1", { status });
        expect(bugRepo.update).toHaveBeenCalledWith(
          "bug-1",
          expect.objectContaining({ status, resolvedAt: expect.any(Date) })
        );
      }
    );

    it("treats a resubmitted, unchanged status as no transition (no first response, closedAt or history)", async () => {
      const closed = { ...bug, status: "Closed", firstResponseAt: null, closedAt: new Date("2026-01-01") };
      bugRepo.findById.mockResolvedValue(closed);
      bugRepo.update.mockResolvedValue({ ...closed, priority: "High" });
      await service.manageBug(admin, "bug-1", { status: "Closed", priority: "High" });
      expect(bugRepo.update).toHaveBeenCalledWith("bug-1", { priority: "High" });
      await Promise.resolve();
      expect(historyRepo.create).not.toHaveBeenCalled();
    });

    it("keeps the original resolvedAt when a fixed bug moves on to Verified", async () => {
      const fixed = { ...bug, status: "Fixed", resolvedAt: new Date("2026-01-01") };
      bugRepo.findById.mockResolvedValue(fixed);
      bugRepo.update.mockResolvedValue({ ...fixed, status: "Verified" });
      await service.manageBug(admin, "bug-1", { status: "Verified" });
      expect(bugRepo.update).toHaveBeenCalledWith(
        "bug-1",
        expect.not.objectContaining({ resolvedAt: expect.anything() })
      );
    });

    it("stamps firstResponseAt the first time status changes away from Open", async () => {
      bugRepo.findById.mockResolvedValue(bug);
      bugRepo.update.mockResolvedValue({ ...bug, status: "In Progress" });
      await service.manageBug(admin, "bug-1", { status: "In Progress" });
      expect(bugRepo.update).toHaveBeenCalledWith(
        "bug-1",
        expect.objectContaining({ status: "In Progress", firstResponseAt: expect.any(Date) })
      );
    });

    it("doesn't overwrite an existing firstResponseAt on a later status change", async () => {
      const responded = { ...bug, status: "In Progress", firstResponseAt: new Date("2026-01-01") };
      bugRepo.findById.mockResolvedValue(responded);
      bugRepo.update.mockResolvedValue({ ...responded, status: "Fixed" });
      await service.manageBug(admin, "bug-1", { status: "Fixed" });
      expect(bugRepo.update).toHaveBeenCalledWith(
        "bug-1",
        expect.not.objectContaining({ firstResponseAt: expect.anything() })
      );
    });

    it("records a bug_status_history row when the status changes", async () => {
      bugRepo.findById.mockResolvedValue(bug);
      bugRepo.update.mockResolvedValue({ ...bug, status: "Fixed" });
      await service.manageBug(admin, "bug-1", { status: "Fixed" });
      await Promise.resolve();
      expect(historyRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ bugId: "bug-1", status: "Fixed", enteredAt: expect.any(Date) })
      );
    });

    it("doesn't record history when the status is unchanged", async () => {
      bugRepo.findById.mockResolvedValue(bug);
      bugRepo.update.mockResolvedValue({ ...bug, severity: "Major" });
      await service.manageBug(admin, "bug-1", { severity: "Major" });
      await Promise.resolve();
      expect(historyRepo.create).not.toHaveBeenCalled();
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

    describe("status only moves forward", () => {
      it.each([
        ["In Progress", "Open"],
        ["Fixed", "In Progress"],
        ["Verified", "Fixed"],
        ["Closed", "Verified"],
        ["Closed", "Open"],
        ["Reopened", "Open"],
      ])("rejects going back from %s to %s", async (current, next) => {
        bugRepo.findById.mockResolvedValue({ ...bug, status: current });
        await expect(service.manageBug(admin, "bug-1", { status: next })).rejects.toMatchObject({
          statusCode: 422,
        });
        expect(bugRepo.update).not.toHaveBeenCalled();
      });

      it.each([
        ["Open", "In Progress"],
        ["Open", "Closed"],
        ["In Progress", "Verified"],
        ["Fixed", "Closed"],
      ])("allows moving forward from %s to %s, skipping stages if needed", async (current, next) => {
        bugRepo.findById.mockResolvedValue({ ...bug, status: current });
        bugRepo.update.mockResolvedValue({ ...bug, status: next });
        await service.manageBug(admin, "bug-1", { status: next });
        expect(bugRepo.update).toHaveBeenCalledWith("bug-1", expect.objectContaining({ status: next }));
      });

      it.each(["Fixed", "Verified", "Closed"])("allows reopening a bug that is %s", async (current) => {
        bugRepo.findById.mockResolvedValue({ ...bug, status: current, resolvedAt: new Date() });
        bugRepo.update.mockResolvedValue({ ...bug, status: "Reopened" });
        await service.manageBug(admin, "bug-1", { status: "Reopened" });
        expect(bugRepo.update).toHaveBeenCalledWith("bug-1", expect.objectContaining({ status: "Reopened" }));
      });

      it.each(["Open", "In Progress"])("rejects reopening a bug that is only %s", async (current) => {
        bugRepo.findById.mockResolvedValue({ ...bug, status: current });
        await expect(service.manageBug(admin, "bug-1", { status: "Reopened" })).rejects.toMatchObject({
          statusCode: 422,
        });
        expect(bugRepo.update).not.toHaveBeenCalled();
      });

      it.each(["In Progress", "Fixed", "Verified", "Closed"])(
        "lets a reopened bug work forward again to %s",
        async (next) => {
          bugRepo.findById.mockResolvedValue({ ...bug, status: "Reopened" });
          bugRepo.update.mockResolvedValue({ ...bug, status: next });
          await service.manageBug(admin, "bug-1", { status: next });
          expect(bugRepo.update).toHaveBeenCalledWith("bug-1", expect.objectContaining({ status: next }));
        }
      );

      it("still lets other triage fields change while the status stays put", async () => {
        const closed = { ...bug, status: "Closed" };
        bugRepo.findById.mockResolvedValue(closed);
        bugRepo.update.mockResolvedValue({ ...closed, priority: "High" });
        await service.manageBug(admin, "bug-1", { status: "Closed", priority: "High" });
        expect(bugRepo.update).toHaveBeenCalledWith("bug-1", expect.objectContaining({ priority: "High" }));
      });
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

    describe("editing the report's content", () => {
      it("lets the reporter (a plain user) correct their own bug", async () => {
        bugRepo.findById.mockResolvedValue(bug); // reportedById: "user-1"
        bugRepo.update.mockResolvedValue({ ...bug, title: "Login button broken on Safari" });
        await service.manageBug(user, "bug-1", {
          title: "Login button broken on Safari",
          stepsToReproduce: ["Open Safari", "Click sign in"],
        });
        expect(projectService.assertCanManageProject).not.toHaveBeenCalled();
        expect(bugRepo.update).toHaveBeenCalledWith("bug-1", {
          title: "Login button broken on Safari",
          stepsToReproduce: ["Open Safari", "Click sign in"],
        });
      });

      it("forbids a plain user who isn't the reporter", async () => {
        bugRepo.findById.mockResolvedValue({ ...bug, reportedById: "someone-else" });
        await expect(service.manageBug(user, "bug-1", { title: "Hijacked" })).rejects.toMatchObject({
          statusCode: 403,
        });
        expect(bugRepo.update).not.toHaveBeenCalled();
      });

      it("lets an admin edit a bug someone else reported", async () => {
        bugRepo.findById.mockResolvedValue(bug);
        bugRepo.update.mockResolvedValue({ ...bug, description: "Fixed typo" });
        await service.manageBug(admin, "bug-1", { description: "Fixed typo" });
        expect(bugRepo.update).toHaveBeenCalledWith("bug-1", { description: "Fixed typo" });
      });

      describe("once the bug is no longer Open", () => {
        const LOCKED = ["In Progress", "Fixed", "Verified", "Closed"];

        it.each(LOCKED)("refuses to edit the report while the bug is %s — even for its reporter", async (status) => {
          bugRepo.findById.mockResolvedValue({ ...bug, status }); // reportedById: "user-1"
          await expect(service.manageBug(user, "bug-1", { title: "Clearer title" })).rejects.toMatchObject({
            statusCode: 422,
            message: expect.stringContaining(status),
          });
          expect(bugRepo.update).not.toHaveBeenCalled();
        });

        it.each(LOCKED)("refuses an admin too while the bug is %s", async (status) => {
          bugRepo.findById.mockResolvedValue({ ...bug, status });
          await expect(service.manageBug(admin, "bug-1", { description: "Fixed typo" })).rejects.toMatchObject({
            statusCode: 422,
          });
          expect(bugRepo.update).not.toHaveBeenCalled();
        });

        it("locks every field of the report, not just the title", async () => {
          bugRepo.findById.mockResolvedValue({ ...bug, status: "In Progress" });
          for (const patch of [
            { description: "x" },
            { stepsToReproduce: ["x"] },
            { expectedBehavior: "x" },
            { actualBehavior: null },
            { environment: "x" },
            { testCaseId: null },
          ]) {
            await expect(service.manageBug(admin, "bug-1", patch)).rejects.toMatchObject({ statusCode: 422 });
          }
          expect(bugRepo.update).not.toHaveBeenCalled();
        });

        it("still lets the team triage it: status, severity, priority and assignee", async () => {
          bugRepo.findById.mockResolvedValue({ ...bug, status: "In Progress" });
          bugRepo.update.mockResolvedValue({ ...bug, status: "Fixed" });
          await service.manageBug(admin, "bug-1", { status: "Fixed", severity: "Major", priority: "High" });
          expect(bugRepo.update).toHaveBeenCalledWith(
            "bug-1",
            expect.objectContaining({ status: "Fixed", severity: "Major", priority: "High" })
          );
        });

        it("lets the report be edited again once the bug is Reopened, for its reporter and for an admin", async () => {
          bugRepo.findById.mockResolvedValue({ ...bug, status: "Reopened" }); // reportedById: "user-1"
          bugRepo.update.mockResolvedValue({ ...bug, title: "Clearer title" });
          await service.manageBug(user, "bug-1", { title: "Clearer title" });
          await service.manageBug(admin, "bug-1", { description: "Now with the new steps" });
          expect(bugRepo.update).toHaveBeenCalledTimes(2);
        });

        it("still allows the edit while it is Open, alongside triage in the same request", async () => {
          bugRepo.findById.mockResolvedValue(bug); // Open
          bugRepo.update.mockResolvedValue({ ...bug, title: "Clearer title" });
          await service.manageBug(admin, "bug-1", { title: "Clearer title", severity: "Major" });
          expect(bugRepo.update).toHaveBeenCalledWith("bug-1", { title: "Clearer title", severity: "Major" });
        });
      });

      it("forbids the reporter from also changing priority (drives SLA targets)", async () => {
        bugRepo.findById.mockResolvedValue(bug);
        await expect(
          service.manageBug(user, "bug-1", { title: "New title", priority: "Low" })
        ).rejects.toMatchObject({ statusCode: 403 });
        expect(bugRepo.update).not.toHaveBeenCalled();
      });

      it("forbids the reporter from changing status or assignee", async () => {
        bugRepo.findById.mockResolvedValue(bug);
        await expect(service.manageBug(user, "bug-1", { status: "Closed" })).rejects.toMatchObject({
          statusCode: 403,
        });
        await expect(service.manageBug(user, "bug-1", { assignedToId: "dev-1" })).rejects.toMatchObject({
          statusCode: 403,
        });
      });

      it("clears optional fields when null is sent", async () => {
        bugRepo.findById.mockResolvedValue(bug);
        bugRepo.update.mockResolvedValue(bug);
        await service.manageBug(user, "bug-1", {
          expectedBehavior: null,
          actualBehavior: null,
          environment: null,
          testCaseId: null,
          stepsToReproduce: [],
        });
        expect(bugRepo.update).toHaveBeenCalledWith("bug-1", {
          expectedBehavior: null,
          actualBehavior: null,
          environment: null,
          testCaseId: null,
          stepsToReproduce: [],
        });
      });

      it("rejects re-linking to a test case from another project (422)", async () => {
        bugRepo.findById.mockResolvedValue(bug);
        testCaseRepo.findById.mockResolvedValue({ id: "case-1", suiteId: "suite-1" });
        testSuiteRepo.findById.mockResolvedValue({ id: "suite-1", projectId: "proj-other" });
        await expect(service.manageBug(user, "bug-1", { testCaseId: "case-1" })).rejects.toMatchObject({
          statusCode: 422,
        });
        expect(bugRepo.update).not.toHaveBeenCalled();
      });

      it("accepts a test case from the same project", async () => {
        bugRepo.findById.mockResolvedValue(bug);
        bugRepo.update.mockResolvedValue({ ...bug, testCaseId: "case-1" });
        testCaseRepo.findById.mockResolvedValue({ id: "case-1", suiteId: "suite-1" });
        testSuiteRepo.findById.mockResolvedValue({ id: "suite-1", projectId: "proj-1" });
        await service.manageBug(user, "bug-1", { testCaseId: "case-1" });
        expect(bugRepo.update).toHaveBeenCalledWith("bug-1", { testCaseId: "case-1" });
      });

      it("doesn't touch status timestamps, history or notifications", async () => {
        bugRepo.findById.mockResolvedValue(bug);
        bugRepo.update.mockResolvedValue({ ...bug, title: "Renamed" });
        await service.manageBug(user, "bug-1", { title: "Renamed" });
        await Promise.resolve();
        expect(bugRepo.update).toHaveBeenCalledWith(
          "bug-1",
          expect.not.objectContaining({ statusUpdatedAt: expect.anything(), firstResponseAt: expect.anything() })
        );
        expect(historyRepo.create).not.toHaveBeenCalled();
        expect(notificationService.notifyBugStatusChanged).not.toHaveBeenCalled();
        expect(notificationService.notifyBugAssigned).not.toHaveBeenCalled();
      });
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


describe("BugService — project-level authority", () => {
  // A read-only viewer (org-wide read, not on the project) can see every bug in
  // the organisation but is not a participant in any project.
  const viewer = { id: "viewer-1", role: "user", permissions: new Set(["project.read", "project.readall"]), organizationId: "org-1" };
  const viewerBug = { ...bug, reportedById: viewer.id };

  function build() {
    const ctx = {};
    ctx.bugRepo = { findById: jest.fn(), create: jest.fn(), update: jest.fn(), softDelete: jest.fn() };
    ctx.projectService = makeProjectService();
    ctx.projectService.assertCanContribute.mockRejectedValue(
      Object.assign(new Error("You have read-only access to this project"), { statusCode: 403 })
    );
    ctx.service = new BugService(
      ctx.bugRepo,
      ctx.projectService,
      makeAuthRepo(),
      { findById: jest.fn() },
      { findById: jest.fn() },
      { findById: jest.fn() },
      {},
      { findMemberUsers: jest.fn().mockResolvedValue([]) },
      { create: jest.fn() }
    );
    return ctx;
  }

  it("cannot report a bug", async () => {
    const { service, bugRepo } = build();
    await expect(
      service.createBug(viewer, { projectId: "proj-1", title: "t", description: "d", severity: "Minor", priority: "Low" })
    ).rejects.toMatchObject({ statusCode: 403, message: expect.stringContaining("read-only") });
    expect(bugRepo.create).not.toHaveBeenCalled();
  });

  it("cannot edit a bug, even one carrying their own id as reporter", async () => {
    const { service, bugRepo } = build();
    bugRepo.findById.mockResolvedValue(viewerBug);
    await expect(service.manageBug(viewer, "bug-1", { title: "x" })).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(bugRepo.update).not.toHaveBeenCalled();
  });

  it("can still read one", async () => {
    const { service, bugRepo, projectService } = build();
    bugRepo.findById.mockResolvedValue(bug);
    await expect(service.getBug(viewer, "bug-1")).resolves.toMatchObject({ id: "bug-1" });
    expect(projectService.getProject).toHaveBeenCalled();
  });
});
