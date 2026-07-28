// modules/feedback/tests/feedback.service.spec.ts
// Focused coverage for manageFeedback's "closed" transition: the generic
// external-contact email fires for ordinary items, but is superseded by a
// dedicated in-app + email notify to the escalating supporter when the item
// being closed was escalated (see feedback.service.ts's isEscalatedClose branch).

jest.mock("../../../shared/utils/mailer", () => ({
  sendFeedbackReceivedEmail: jest.fn().mockResolvedValue(undefined),
  sendFeedbackStatusEmail: jest.fn().mockResolvedValue(undefined),
  sendFeedbackConfirmationReceivedEmail: jest.fn().mockResolvedValue(undefined),
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
  status: FeedbackStatus.AWAITING_CONFIRMATION,
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
      expect.any(String),
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

// Coverage for the shared public confirmation page: one route/schema serves
// both the product tier and (pre-escalation) the IT-support tier, so the
// dispatch logic here matters as much as either tier's own state machine.
describe("FeedbackService — public confirmation dispatch", () => {
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

  describe("getPublicConfirmationContext", () => {
    it("404s on an unknown/deleted item", async () => {
      feedbackRepo.findById.mockResolvedValue(null);
      await expect(service.getPublicConfirmationContext("fb-1")).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it("collapses a direct item's product status", async () => {
      feedbackRepo.findById.mockResolvedValue({
        ...baseItem,
        clientCompanyId: null,
        clientCompany: null,
        supportStatus: null,
        status: FeedbackStatus.AWAITING_CONFIRMATION,
      });
      projectRepo.findById.mockResolvedValue({ id: "proj-1", name: "Product A", feedbackToken: "tok-1" });

      const ctx = await service.getPublicConfirmationContext("fb-1");

      expect(ctx.status).toBe("pending_your_confirmation");
      expect(ctx.feedbackToken).toBe("tok-1");
    });

    it("collapses a pre-escalation company-routed item's support status instead", async () => {
      feedbackRepo.findById.mockResolvedValue({
        ...baseItem,
        clientCompanyId: "cc-1",
        clientCompany: { name: "Acme", feedbackToken: "company-tok" },
        supportStatus: SupportStatus.AWAITING_CONFIRMATION,
        status: FeedbackStatus.LOGGED, // the product tier hasn't started yet
      });
      projectRepo.findById.mockResolvedValue({ id: "proj-1", name: "Product A", feedbackToken: "proj-tok" });

      const ctx = await service.getPublicConfirmationContext("fb-1");

      expect(ctx.status).toBe("pending_your_confirmation");
      expect(ctx.feedbackToken).toBe("company-tok");
    });
  });

  describe("submitConfirmation", () => {
    it("404s on an unknown/deleted item before any dispatch", async () => {
      feedbackRepo.findById.mockResolvedValue(null);
      await expect(service.submitConfirmation("fb-1", true)).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it("delegates to FeedbackSupportService for a pre-escalation company-routed item", async () => {
      feedbackRepo.findById.mockResolvedValue({
        ...baseItem,
        clientCompanyId: "cc-1",
        supportStatus: SupportStatus.AWAITING_CONFIRMATION,
        status: FeedbackStatus.LOGGED,
      });
      const { FeedbackSupportService } = require("../services/feedbackSupport.service");
      const spy = jest
        .spyOn(FeedbackSupportService.Instance, "submitConfirmation")
        .mockResolvedValue({ id: "fb-1" } as any);

      const result = await service.submitConfirmation("fb-1", false, "Still broken");

      expect(spy).toHaveBeenCalledWith("fb-1", false, "Still broken");
      expect(result).toEqual({ id: "fb-1" });
      expect(feedbackRepo.update).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it("still handles a direct item's own product-tier confirmation", async () => {
      feedbackRepo.findById.mockResolvedValue({
        ...baseItem,
        clientCompanyId: null,
        supportStatus: null,
        status: FeedbackStatus.AWAITING_CONFIRMATION,
      });
      feedbackRepo.update.mockResolvedValue({ ...baseItem, status: FeedbackStatus.CLOSED });

      await service.submitConfirmation("fb-1", true);

      expect(feedbackRepo.update).toHaveBeenCalledWith(
        "fb-1",
        expect.objectContaining({ status: FeedbackStatus.CLOSED })
      );
    });

    it("409s an already-escalated item once its own product status has moved past awaiting confirmation", async () => {
      feedbackRepo.findById.mockResolvedValue({
        ...baseItem,
        clientCompanyId: "cc-1",
        supportStatus: SupportStatus.ESCALATED,
        status: FeedbackStatus.INVESTIGATING,
      });
      await expect(service.submitConfirmation("fb-1", true)).rejects.toMatchObject({
        statusCode: 409,
      });
    });
  });
});
