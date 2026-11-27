// modules/reviewPrompt/tests/reviewPrompt.service.spec.js
// The review reminder: when it appears, what it lists, and the one status change
// it opens to a reporter who doesn't lead the project.
jest.mock("../../activity/services/activity.service", () => ({
  ActivityService: { Instance: { log: jest.fn() } },
}));

const { ReviewPromptService } = require("../services/reviewPrompt.service");
const { BugService } = require("../../bug/services/bug.service");
const { FeatureRequestService } = require("../../featureRequest/services/featureRequest.service");
const { AppError } = require("../../../shared/errors/AppError");

const reporter = { id: "user-1", organizationId: "org-1" };
const someoneElse = { id: "user-2", organizationId: "org-1" };

const waitingBug = {
  id: "bug-1",
  bugNumber: 1,
  projectId: "proj-1",
  title: "Login broken",
  status: "Fixed",
  reportedById: reporter.id,
  assignedToId: "dev-1",
  createdAt: new Date("2026-11-01"),
  statusUpdatedAt: new Date("2026-11-20"),
  resolvedAt: new Date("2026-11-20"),
  firstResponseAt: new Date("2026-11-02"),
  deletedAt: null,
};

const waitingRequest = {
  id: "fr-1",
  requestNumber: 1,
  projectId: "proj-1",
  title: "Dark mode",
  status: "ready_for_review",
  submittedById: reporter.id,
  assignedToId: "dev-1",
  createdAt: new Date("2026-11-01"),
  statusUpdatedAt: new Date("2026-11-10"),
  firstResponseAt: new Date("2026-11-02"),
  resolvedAt: null,
  deletedAt: null,
};

const projectService = () => ({
  getProject: jest.fn().mockResolvedValue({ id: "proj-1", name: "Portal", organizationId: "org-1" }),
  assertCanContribute: jest.fn().mockResolvedValue(undefined),
  // The reporter never leads the project in these tests.
  assertCanManageProject: jest.fn().mockRejectedValue(new AppError("Leads only", 403)),
});

describe("ReviewPromptService.claim", () => {
  let repo, bugRepo, frRepo, projects, service;

  beforeEach(() => {
    repo = {
      findSettings: jest.fn().mockResolvedValue(null),
      saveSettings: jest.fn(),
      promptedWithin: jest.fn().mockResolvedValue(false),
      claim: jest.fn().mockResolvedValue(true),
    };
    bugRepo = {
      findAwaitingReview: jest.fn().mockResolvedValue([waitingBug]),
      findAssignedOpen: jest.fn().mockResolvedValue([]),
    };
    frRepo = {
      findAwaitingReview: jest.fn().mockResolvedValue([waitingRequest]),
      findAssignedOpen: jest.fn().mockResolvedValue([]),
    };
    projects = projectService();
    service = new ReviewPromptService(repo, bugRepo, frRepo, projects);
  });

  it("returns what is waiting, longest first, every 2 hours by default", async () => {
    const { items } = await service.claim(reporter);
    expect(items.map((i) => i.id)).toEqual(["fr-1", "bug-1"]);
    expect(repo.claim).toHaveBeenCalledWith(reporter.id, 2);
  });

  it("reminds an assignee of their open work, in the lead's order then oldest", async () => {
    const open = (id, extra) => ({ ...waitingBug, id, status: "Open", ...extra });
    bugRepo.findAwaitingReview.mockResolvedValue([]);
    frRepo.findAwaitingReview.mockResolvedValue([]);
    bugRepo.findAssignedOpen.mockResolvedValue([
      open("old", { fixOrder: null, createdAt: new Date("2026-10-01") }),
      open("second", { fixOrder: 2 }),
    ]);
    frRepo.findAssignedOpen.mockResolvedValue([
      { ...waitingRequest, id: "first", status: "in_progress", priority: 1 },
    ]);

    const { items, work } = await service.claim(reporter);

    expect(items).toEqual([]);
    expect(work.map((w) => w.id)).toEqual(["first", "second", "old"]);
    expect(work[0]).toMatchObject({ type: "feature_request", status: "in_progress", projectName: "Portal" });
    expect(bugRepo.findAssignedOpen).toHaveBeenCalledWith(reporter.id);
    expect(repo.claim).toHaveBeenCalled();
  });

  it("uses the platform owner's interval", async () => {
    repo.findSettings.mockResolvedValue({ enabled: true, intervalHours: 8, updatedAt: new Date() });
    await service.claim(reporter);
    expect(repo.promptedWithin).toHaveBeenCalledWith(reporter.id, 8);
    expect(repo.claim).toHaveBeenCalledWith(reporter.id, 8);
  });

  it("shows nothing while switched off", async () => {
    repo.findSettings.mockResolvedValue({ enabled: false, intervalHours: 2, updatedAt: new Date() });
    await expect(service.claim(reporter)).resolves.toEqual({ items: [], work: [] });
    expect(bugRepo.findAwaitingReview).not.toHaveBeenCalled();
  });

  it("shows nothing before the interval has passed", async () => {
    repo.promptedWithin.mockResolvedValue(true);
    await expect(service.claim(reporter)).resolves.toEqual({ items: [], work: [] });
    expect(repo.claim).not.toHaveBeenCalled();
  });

  it("doesn't use up a turn when nothing is waiting", async () => {
    bugRepo.findAwaitingReview.mockResolvedValue([]);
    frRepo.findAwaitingReview.mockResolvedValue([]);
    await expect(service.claim(reporter)).resolves.toEqual({ items: [], work: [] });
    expect(repo.claim).not.toHaveBeenCalled();
  });

  it("shows nothing when another tab claimed this turn", async () => {
    repo.claim.mockResolvedValue(false);
    await expect(service.claim(reporter)).resolves.toEqual({ items: [], work: [] });
  });

  it("leaves out items in a project the reporter can no longer act in", async () => {
    projects.assertCanContribute.mockRejectedValue(new AppError("Read-only", 403));
    await expect(service.claim(reporter)).resolves.toEqual({ items: [], work: [] });
    expect(repo.claim).not.toHaveBeenCalled();
  });
});

describe("an assignee submitting work for review", () => {
  const developer = { id: "dev-1", organizationId: "org-1" };

  const bugService = (record) => {
    const bugRepo = {
      findById: jest.fn().mockResolvedValue(record),
      update: jest.fn().mockImplementation(async (_id, patch) => ({ ...record, ...patch })),
    };
    const service = new BugService(
      bugRepo,
      projectService(),
      { findUserById: jest.fn().mockResolvedValue(null) },
      {},
      {},
      {},
      { notifyBugStatusChanged: jest.fn() },
      { findMemberUsers: jest.fn().mockResolvedValue([]), getRole: jest.fn() },
      { create: jest.fn().mockResolvedValue(undefined) },
      {}
    );
    return { service, bugRepo };
  };

  const requestService = (record) => {
    const frRepo = {
      findById: jest.fn().mockResolvedValue(record),
      update: jest.fn().mockImplementation(async (_id, patch) => ({ ...record, ...patch })),
    };
    const service = new FeatureRequestService(
      frRepo,
      {},
      {},
      { findUserById: jest.fn().mockResolvedValue(null) },
      { notifyFeatureRequestStatusChanged: jest.fn() },
      projectService(),
      { findMemberUsers: jest.fn().mockResolvedValue([]), getRole: jest.fn() },
      { create: jest.fn().mockResolvedValue(undefined) }
    );
    return { service, frRepo };
  };

  const openBug = { ...waitingBug, status: "In Progress", resolvedAt: null };
  const openRequest = { ...waitingRequest, status: "in_progress" };

  it.each(["Open", "In Progress", "Reopened"])("marks their %s bug Fixed", async (status) => {
    const { service, bugRepo } = bugService({ ...openBug, status });
    await service.submitForReview(developer, "bug-1");
    expect(bugRepo.update).toHaveBeenCalledWith("bug-1", expect.objectContaining({ status: "Fixed" }));
  });

  it("marks their feature request Ready For Review", async () => {
    const { service, frRepo } = requestService(openRequest);
    await service.submitForReview(developer, "fr-1");
    expect(frRepo.update).toHaveBeenCalledWith("fr-1", expect.objectContaining({ status: "ready_for_review" }));
  });

  it("refuses anyone but the assignee", async () => {
    const bug = bugService(openBug);
    const request = requestService(openRequest);
    await expect(bug.service.submitForReview(someoneElse, "bug-1")).rejects.toMatchObject({ statusCode: 403 });
    await expect(request.service.submitForReview(someoneElse, "fr-1")).rejects.toMatchObject({ statusCode: 403 });
    expect(bug.bugRepo.update).not.toHaveBeenCalled();
    expect(request.frRepo.update).not.toHaveBeenCalled();
  });

  it("refuses work that has already moved past them", async () => {
    const bug = bugService({ ...openBug, status: "Closed" });
    const request = requestService({ ...openRequest, status: "done" });
    await expect(bug.service.submitForReview(developer, "bug-1")).rejects.toMatchObject({ statusCode: 409 });
    await expect(request.service.submitForReview(developer, "fr-1")).rejects.toMatchObject({ statusCode: 409 });
    expect(bug.bugRepo.update).not.toHaveBeenCalled();
    expect(request.frRepo.update).not.toHaveBeenCalled();
  });

  it("still doesn't let the assignee change status the ordinary way", async () => {
    const { service, bugRepo } = bugService(openBug);
    await expect(service.manageBug(developer, "bug-1", { status: "Closed" })).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(bugRepo.update).not.toHaveBeenCalled();
  });
});

describe("answering a bug review", () => {
  let bugRepo, commentRepo, service;

  beforeEach(() => {
    bugRepo = {
      findById: jest.fn().mockResolvedValue(waitingBug),
      update: jest.fn().mockImplementation(async (_id, patch) => ({ ...waitingBug, ...patch })),
      incrementCommentCount: jest.fn(),
    };
    commentRepo = { create: jest.fn().mockResolvedValue({ id: "c-1" }) };
    service = new BugService(
      bugRepo,
      projectService(),
      { findUserById: jest.fn().mockResolvedValue(null) },
      {},
      {},
      {},
      { notifyBugStatusChanged: jest.fn() },
      { findMemberUsers: jest.fn().mockResolvedValue([]), getRole: jest.fn() },
      { create: jest.fn().mockResolvedValue(undefined) },
      commentRepo
    );
  });

  it("lets the reporter close a Fixed bug without leading the project", async () => {
    await service.answerReview(reporter, "bug-1", { approved: true });
    expect(bugRepo.update).toHaveBeenCalledWith("bug-1", expect.objectContaining({ status: "Closed" }));
    expect(commentRepo.create).not.toHaveBeenCalled();
  });

  it("reopens it with the reason as a comment", async () => {
    await service.answerReview(reporter, "bug-1", { approved: false, reason: "Still fails" });
    expect(commentRepo.create).toHaveBeenCalledWith(expect.objectContaining({ body: "Not fixed: Still fails" }));
    expect(bugRepo.update).toHaveBeenCalledWith(
      "bug-1",
      expect.objectContaining({ status: "Reopened", resolvedAt: null })
    );
  });

  it("leaves the bug alone when the reason can't be saved", async () => {
    commentRepo.create.mockRejectedValue(new AppError("Comments are temporarily unavailable", 503));
    await expect(
      service.answerReview(reporter, "bug-1", { approved: false, reason: "Still fails" })
    ).rejects.toMatchObject({ statusCode: 503 });
    expect(bugRepo.update).not.toHaveBeenCalled();
  });

  it("refuses anyone but the reporter", async () => {
    await expect(service.answerReview(someoneElse, "bug-1", { approved: true })).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(bugRepo.update).not.toHaveBeenCalled();
  });

  it("refuses a bug that isn't marked Fixed", async () => {
    bugRepo.findById.mockResolvedValue({ ...waitingBug, status: "In Progress" });
    await expect(service.answerReview(reporter, "bug-1", { approved: true })).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(bugRepo.update).not.toHaveBeenCalled();
  });

  it("still doesn't let the reporter change status the ordinary way", async () => {
    await expect(service.manageBug(reporter, "bug-1", { status: "Closed" })).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(bugRepo.update).not.toHaveBeenCalled();
  });
});

describe("answering a feature request review", () => {
  let frRepo, commentRepo, service;

  beforeEach(() => {
    frRepo = {
      findById: jest.fn().mockResolvedValue(waitingRequest),
      update: jest.fn().mockImplementation(async (_id, patch) => ({ ...waitingRequest, ...patch })),
      incrementCommentCount: jest.fn(),
    };
    commentRepo = { create: jest.fn().mockResolvedValue({ id: "c-1" }) };
    service = new FeatureRequestService(
      frRepo,
      {},
      commentRepo,
      { findUserById: jest.fn().mockResolvedValue(null) },
      { notifyFeatureRequestStatusChanged: jest.fn() },
      projectService(),
      { findMemberUsers: jest.fn().mockResolvedValue([]), getRole: jest.fn() },
      { create: jest.fn().mockResolvedValue(undefined) }
    );
  });

  it("marks it Done when approved", async () => {
    await service.answerReview(reporter, "fr-1", { approved: true });
    expect(frRepo.update).toHaveBeenCalledWith("fr-1", expect.objectContaining({ status: "done" }));
  });

  it("steps back to In Progress with the reason when not", async () => {
    await service.answerReview(reporter, "fr-1", { approved: false, reason: "No toggle" });
    expect(commentRepo.create).toHaveBeenCalledWith(expect.objectContaining({ body: "Not done yet: No toggle" }));
    expect(frRepo.update).toHaveBeenCalledWith("fr-1", expect.objectContaining({ status: "in_progress" }));
  });

  it("refuses anyone but the submitter", async () => {
    await expect(service.answerReview(someoneElse, "fr-1", { approved: true })).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(frRepo.update).not.toHaveBeenCalled();
  });

  it("refuses a request that isn't Ready For Review", async () => {
    frRepo.findById.mockResolvedValue({ ...waitingRequest, status: "done" });
    await expect(
      service.answerReview(reporter, "fr-1", { approved: false, reason: "x" })
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(commentRepo.create).not.toHaveBeenCalled();
  });
});
