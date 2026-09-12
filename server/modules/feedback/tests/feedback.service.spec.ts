// modules/feedback/tests/feedback.service.spec.ts
// Focused coverage for manageFeedback's "closed" transition: the generic
// external-contact email fires for ordinary items, but is superseded by a
// dedicated in-app + email notify to the escalating supporter when the item
// being closed was escalated (see feedback.service.ts's isEscalatedClose branch).

jest.mock("../../../shared/utils/mailer", () => ({
  sendFeedbackReceivedEmail: jest.fn().mockResolvedValue(undefined),
  sendFeedbackStatusEmail: jest.fn().mockResolvedValue(undefined),
}));

import { FeedbackService } from "../services/feedback.service";

const { UserRole, FeedbackStatus, SupportStatus } = require("../../../config/constants");
const { sendFeedbackStatusEmail } = require("../../../shared/utils/mailer");

function makeFeedbackRepo() {
  return {
    findById: jest.fn(),
    update: jest.fn(),
    setAssignees: jest.fn(),
  };
}

function makeHistoryRepo() {
  return { create: jest.fn().mockResolvedValue({}) };
}

function makeProjectRepo() {
  return { findById: jest.fn() };
}

function makeProjectService() {
  return {
    getProject: jest.fn().mockResolvedValue({ id: "proj-1", name: "Product A", organizationId: "org-1" }),
    canManageProject: jest.fn().mockResolvedValue(true),
  };
}

function makeMemberRepo() {
  return { findMemberUsers: jest.fn().mockResolvedValue([]) };
}

function makeAuthRepo() {
  return {
    findUserById: jest.fn().mockResolvedValue({
      id: "sup-1",
      email: "sup@client.co",
      firstName: "Sam",
      lastName: "Support",
    }),
    findByRoleAndOrg: jest.fn().mockResolvedValue([]),
  };
}

function makeNotificationService() {
  return { notifyFeedbackClosedForSupporter: jest.fn().mockResolvedValue(undefined) };
}

const admin = { id: "admin-1", role: UserRole.ADMIN, organizationId: "org-1" };

const baseItem = {
  id: "fb-1",
  ticketNumber: 42,
  createdAt: new Date("2024-01-15T00:00:00.000Z"),
  projectId: "proj-1",
  clientCompanyId: null,
  escalatedById: null,
  escalatedBy: null,
  clientCompany: null,
  status: FeedbackStatus.RESOLVED,
  title: "Broken export",
  submitterName: "End User",
  submitterEmail: "user@example.com",
  adminResponse: null,
  assignees: [],
  deletedAt: null,
};

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe("FeedbackService.manageFeedback — closing", () => {
  let feedbackRepo: any;
  let historyRepo: any;
  let projectRepo: any;
  let projectService: any;
  let memberRepo: any;
  let authRepo: any;
  let notificationService: any;
  let service: FeedbackService;

  beforeEach(() => {
    jest.clearAllMocks();
    feedbackRepo = makeFeedbackRepo();
    historyRepo = makeHistoryRepo();
    projectRepo = makeProjectRepo();
    projectService = makeProjectService();
    memberRepo = makeMemberRepo();
    authRepo = makeAuthRepo();
    notificationService = makeNotificationService();
    service = new FeedbackService(
      feedbackRepo,
      historyRepo,
      projectRepo,
      projectService,
      memberRepo,
      authRepo,
      notificationService
    );
  });

  it("emails the original submitter for a direct (non-escalated) item", async () => {
    feedbackRepo.findById.mockResolvedValue({ ...baseItem });
    feedbackRepo.update.mockResolvedValue({ ...baseItem, status: FeedbackStatus.CLOSED });

    await service.manageFeedback(admin, "fb-1", { status: FeedbackStatus.CLOSED });

    expect(sendFeedbackStatusEmail).toHaveBeenCalledWith(
      "user@example.com",
      "End User",
      "Product A",
      "TKT-20240115-042 — Broken export",
      FeedbackStatus.CLOSED,
      expect.any(String),
      null,
      "org-1"
    );
    expect(notificationService.notifyFeedbackClosedForSupporter).not.toHaveBeenCalled();
  });

  it("notifies the escalating supporter instead of emailing generically when an escalated item closes", async () => {
    const escalatedItem = {
      ...baseItem,
      clientCompanyId: "cc-1",
      supportStatus: SupportStatus.ESCALATED,
      escalatedById: "sup-1",
      escalatedBy: { id: "sup-1", firstName: "Sam", lastName: "Support", email: "sup@client.co" },
      clientCompany: { id: "cc-1", name: "Client Co" },
    };
    feedbackRepo.findById.mockResolvedValue(escalatedItem);
    feedbackRepo.update.mockResolvedValue({ ...escalatedItem, status: FeedbackStatus.CLOSED });

    await service.manageFeedback(admin, "fb-1", { status: FeedbackStatus.CLOSED });
    await flush();

    expect(sendFeedbackStatusEmail).not.toHaveBeenCalled();
    expect(notificationService.notifyFeedbackClosedForSupporter).toHaveBeenCalledWith(
      escalatedItem.escalatedBy,
      expect.objectContaining({
        feedbackId: "fb-1",
        projectName: "Product A",
        companyName: "Client Co",
        title: "TKT-20240115-042 — Broken export",
        organizationId: "org-1",
      })
    );
  });

  it("falls back to looking up the escalating supporter when the relation wasn't loaded", async () => {
    const escalatedItem = {
      ...baseItem,
      clientCompanyId: "cc-1",
      supportStatus: SupportStatus.ESCALATED,
      escalatedById: "sup-1",
      escalatedBy: null,
      clientCompany: { id: "cc-1", name: "Client Co" },
    };
    feedbackRepo.findById.mockResolvedValue(escalatedItem);
    feedbackRepo.update.mockResolvedValue({ ...escalatedItem, status: FeedbackStatus.CLOSED });

    await service.manageFeedback(admin, "fb-1", { status: FeedbackStatus.CLOSED });
    await flush();

    expect(authRepo.findUserById).toHaveBeenCalledWith("sup-1");
    expect(notificationService.notifyFeedbackClosedForSupporter).toHaveBeenCalledWith(
      expect.objectContaining({ id: "sup-1", email: "sup@client.co" }),
      expect.anything()
    );
  });
});


// SLA timestamps (see modules/sla): stamped once, the first time each applies.
describe("FeedbackService.manageFeedback — SLA timestamps", () => {
  let feedbackRepo: any;
  let service: FeedbackService;

  beforeEach(() => {
    jest.clearAllMocks();
    feedbackRepo = makeFeedbackRepo();
    service = new FeedbackService(
      feedbackRepo,
      makeHistoryRepo() as any,
      makeProjectRepo() as any,
      makeProjectService() as any,
      makeMemberRepo() as any,
      makeAuthRepo() as any,
      makeNotificationService() as any
    );
  });

  const fresh = {
    ...baseItem,
    status: FeedbackStatus.LOGGED,
    firstResponseAt: null,
    resolvedAt: null,
    closedAt: null,
  };

  it("stamps firstResponseAt on the first stage past logged", async () => {
    feedbackRepo.findById.mockResolvedValue({ ...fresh });
    feedbackRepo.update.mockImplementation((_id: string, patch: any) => Promise.resolve({ ...fresh, ...patch }));

    await service.manageFeedback(admin, "fb-1", { status: FeedbackStatus.ACKNOWLEDGED });

    const patch = feedbackRepo.update.mock.calls[0][1];
    expect(patch.firstResponseAt).toBeInstanceOf(Date);
    expect(patch.resolvedAt).toBeUndefined();
    expect(patch.closedAt).toBeUndefined();
  });

  it("never moves an existing firstResponseAt", async () => {
    const already = new Date("2024-01-15T01:00:00.000Z");
    feedbackRepo.findById.mockResolvedValue({ ...fresh, status: FeedbackStatus.ACKNOWLEDGED, firstResponseAt: already });
    feedbackRepo.update.mockImplementation((_id: string, patch: any) => Promise.resolve({ ...fresh, ...patch }));

    await service.manageFeedback(admin, "fb-1", { status: FeedbackStatus.ASSIGNED });

    expect(feedbackRepo.update.mock.calls[0][1].firstResponseAt).toBeUndefined();
  });

  it("stamps resolvedAt on resolve, then closedAt (not resolvedAt again) on close", async () => {
    feedbackRepo.findById.mockResolvedValue({ ...fresh, status: FeedbackStatus.INVESTIGATING, firstResponseAt: new Date() });
    feedbackRepo.update.mockImplementation((_id: string, patch: any) => Promise.resolve({ ...fresh, ...patch }));
    await service.manageFeedback(admin, "fb-1", { status: FeedbackStatus.RESOLVED });
    const resolvePatch = feedbackRepo.update.mock.calls[0][1];
    expect(resolvePatch.resolvedAt).toBeInstanceOf(Date);
    expect(resolvePatch.closedAt).toBeUndefined();

    const resolvedAt = new Date("2024-01-16T00:00:00.000Z");
    feedbackRepo.findById.mockResolvedValue({ ...fresh, status: FeedbackStatus.RESOLVED, firstResponseAt: new Date(), resolvedAt });
    await service.manageFeedback(admin, "fb-1", { status: FeedbackStatus.CLOSED });
    const closePatch = feedbackRepo.update.mock.calls[1][1];
    expect(closePatch.closedAt).toBeInstanceOf(Date);
    expect(closePatch.resolvedAt).toBeUndefined();
  });
});
