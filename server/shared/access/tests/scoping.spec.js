// shared/access/tests/scoping.spec.js
//
// Record-level scoping for the self-service roles.
//
// Permissions say what KIND of thing you may touch; scoping says WHICH ROWS.
// A Tester holds result.read exactly as a QA manager does — what stops them
// reading someone else's results is the scoping layer, not the permission. The
// reference model's "a parent cannot read another family's data" is this test
// in TestMate's own terms:
//
//   a Tester cannot reach a project they are not on,
//   a Tester cannot touch a result for a case not assigned to them,
//   an external supporter cannot reach another company's queue.
//
// Every one of these is enforced in a service or a repository query, never in
// the UI.
const { ProjectService } = require("../../../modules/project/services/project.service");
const {
  TestRunResultService,
} = require("../../../modules/testRunResult/services/testRunResult.service");
const {
  FeedbackSupportService,
} = require("../../../modules/feedback/services/feedbackSupport.service");
const { actorFor, permissionsForRole } = require("../../../test/actors");

// ── Actors ────────────────────────────────────────────────────────────────────

// Maps to QA engineer: project.read but NOT project.readall.
const tester = actorFor("user", { id: "tester-1" });
// Maps to Organisation administrator: holds project.readall.
const admin = actorFor("admin", { id: "admin-1" });

const supporterA = {
  id: "sup-a",
  organizationId: "org-1",
  clientCompanyId: "company-a",
  isSupportLead: false,
  permissions: permissionsForRole("support_agent"),
};

const project = { id: "proj-1", organizationId: "org-1", deletedAt: null, name: "Apollo" };

describe("scoping — a Tester only reaches their own work", () => {
  function makeService({ memberRole = null, hasAssignment = false } = {}) {
    const projectRepo = {
      findById: jest.fn().mockResolvedValue(project),
      fetchPaginated: jest.fn().mockResolvedValue({ data: [], meta: {} }),
    };
    const memberRepo = { getRole: jest.fn().mockResolvedValue(memberRole) };
    const testCaseRepo = {
      hasAssignmentInProject: jest.fn().mockResolvedValue(hasAssignment),
    };
    const service = new ProjectService(
      projectRepo,
      { findUserById: jest.fn() },
      testCaseRepo,
      memberRepo,
      { notifyProjectMemberAdded: jest.fn() }
    );
    return { service, projectRepo, memberRepo, testCaseRepo };
  }

  it("refuses a project the tester is neither a member of nor assigned in", async () => {
    const { service } = makeService({ memberRole: null, hasAssignment: false });
    await expect(service.getProject(tester, "proj-1")).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("allows a project the tester is a member of", async () => {
    const { service } = makeService({ memberRole: "member" });
    await expect(service.getProject(tester, "proj-1")).resolves.toMatchObject({
      id: "proj-1",
    });
  });

  it("allows a project the tester has a case assigned in, even without membership", async () => {
    const { service } = makeService({ memberRole: null, hasAssignment: true });
    await expect(service.getProject(tester, "proj-1")).resolves.toMatchObject({
      id: "proj-1",
    });
  });

  it("narrows the tester's project list to their own, and never the admin's", async () => {
    const { service, projectRepo } = makeService();
    await service.fetchProjects(tester, {});
    expect(projectRepo.fetchPaginated).toHaveBeenCalledWith(
      expect.objectContaining({ restrictedUserId: "tester-1" })
    );

    projectRepo.fetchPaginated.mockClear();
    await service.fetchProjects(admin, {});
    expect(projectRepo.fetchPaginated).toHaveBeenCalledWith(
      expect.objectContaining({ restrictedUserId: undefined })
    );
  });

  it("refuses a project in another organisation outright", async () => {
    const { service, projectRepo } = makeService({ memberRole: "member" });
    projectRepo.findById.mockResolvedValue({ ...project, organizationId: "org-2" });
    await expect(service.getProject(admin, "proj-1")).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("does not let a tester manage a project they merely belong to", async () => {
    const { service } = makeService({ memberRole: "member" });
    await expect(service.canManageProject(tester, "proj-1")).resolves.toBe(false);
  });

  it("does let the project's team lead manage it", async () => {
    const { service } = makeService({ memberRole: "team_lead" });
    await expect(service.canManageProject(tester, "proj-1")).resolves.toBe(true);
  });
});

describe("scoping — a Tester only touches results for their own cases", () => {
  function makeService({ assignees = [] } = {}) {
    const resultRepo = {
      findById: jest.fn().mockResolvedValue({
        id: "res-1",
        runId: "run-1",
        testCaseId: "case-1",
        status: null,
      }),
      fetchPaginated: jest.fn().mockResolvedValue({ data: [], meta: {} }),
    };
    const runService = {
      getTestRun: jest.fn().mockResolvedValue({
        run: { id: "run-1", projectId: "proj-1", status: "in_progress", name: "R1" },
      }),
    };
    const tcRepo = {
      findById: jest.fn().mockResolvedValue({ id: "case-1", assignees }),
    };
    return {
      service: new TestRunResultService(resultRepo, runService, tcRepo, {}, {}),
      resultRepo,
    };
  }

  it("hides a result for a case assigned to someone else", async () => {
    const { service } = makeService({ assignees: [{ id: "someone-else" }] });
    // 404 rather than 403: the tester should not learn the row exists.
    await expect(service.getResult(tester, "res-1")).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("returns a result for a case assigned to them", async () => {
    const { service } = makeService({ assignees: [{ id: "tester-1" }] });
    await expect(service.getResult(tester, "res-1")).resolves.toMatchObject({
      id: "res-1",
    });
  });

  it("does not narrow an actor with organisation-wide project visibility", async () => {
    const { service } = makeService({ assignees: [{ id: "someone-else" }] });
    await expect(service.getResult(admin, "res-1")).resolves.toMatchObject({ id: "res-1" });
  });

  it("filters the tester's result list to their own assignments", async () => {
    const { service, resultRepo } = makeService();
    await service.fetchResults(tester, { runId: "run-1" });
    expect(resultRepo.fetchPaginated).toHaveBeenCalledWith(
      expect.objectContaining({ assigneeId: "tester-1" })
    );

    resultRepo.fetchPaginated.mockClear();
    await service.fetchResults(admin, { runId: "run-1" });
    expect(resultRepo.fetchPaginated).toHaveBeenCalledWith(
      expect.objectContaining({ assigneeId: undefined })
    );
  });
});

describe("scoping — an external supporter only reaches their own company", () => {
  function makeService(item) {
    const feedbackRepo = {
      findById: jest.fn().mockResolvedValue(item),
      fetchPaginated: jest.fn().mockResolvedValue({ data: [], meta: {} }),
    };
    const supportHistoryRepo = { findByFeedback: jest.fn().mockResolvedValue([]) };
    const service = new FeedbackSupportService(
      feedbackRepo,
      {},
      {},
      {},
      {},
      {},
      { findByClientCompany: jest.fn().mockResolvedValue([]) },
      {},
      supportHistoryRepo
    );
    return { service, feedbackRepo };
  }

  it("hides a ticket belonging to another client company", async () => {
    const { service } = makeService({
      id: "fb-1",
      clientCompanyId: "company-b",
      deletedAt: null,
    });
    await expect(service.getSupportTimeline(supporterA, "fb-1")).rejects.toBeDefined();
  });

  it("returns one of their own company's tickets", async () => {
    const { service } = makeService({
      id: "fb-1",
      clientCompanyId: "company-a",
      deletedAt: null,
    });
    await expect(service.getSupportTimeline(supporterA, "fb-1")).resolves.toEqual([]);
  });

  it("scopes the queue listing to the supporter's own company", async () => {
    const { service, feedbackRepo } = makeService(null);
    await service.fetchQueue(supporterA, {});
    expect(feedbackRepo.fetchPaginated).toHaveBeenCalledWith(
      expect.objectContaining({ clientCompanyId: "company-a" })
    );
  });

  it("denies a supporter account with no company rather than widening its scope", async () => {
    const orphan = { ...supporterA, clientCompanyId: null };
    const { service } = makeService({ id: "fb-1", clientCompanyId: "company-a" });
    await expect(service.fetchQueue(orphan, {})).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("keeps the teammate list to leads only", async () => {
    const { service } = makeService(null);
    await expect(service.listTeammates(supporterA)).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(
      service.listTeammates({ ...supporterA, isSupportLead: true })
    ).resolves.toEqual([]);
  });
});
