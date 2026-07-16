// modules/feedback/tests/feedbackIntegration.service.spec.ts
// Coverage for the partner integration API's create path: idempotent
// creation via externalRef (including the concurrent-retry race), and the
// collapsed external status mapping consumed by GET /integrations/tickets.

jest.mock("../../../shared/utils/mailer", () => ({
  sendFeedbackReceivedEmail: jest.fn().mockResolvedValue(undefined),
  sendFeedbackStatusEmail: jest.fn().mockResolvedValue(undefined),
  sendFeedbackConfirmationReceivedEmail: jest.fn().mockResolvedValue(undefined),
}));

import { FeedbackService } from "../services/feedback.service";
import { toExternalStatus, ExternalFeedbackStatus } from "../dto/feedback.dto";

const { FeedbackStatus, FeedbackSource } = require("../../../config/constants");

function makeFeedbackRepo() {
  return {
    create: jest.fn(),
    findById: jest.fn(),
    findByProjectAndExternalRef: jest.fn().mockResolvedValue(null),
  };
}

function makeHistoryRepo(): any {
  return { create: jest.fn().mockResolvedValue({}) };
}

function makeProjectRepo(): any {
  return { findById: jest.fn() };
}

function makeProjectService(): any {
  return { getProject: jest.fn(), canManageProject: jest.fn() };
}

function makeAuthRepo() {
  return {
    findByRole: jest.fn().mockResolvedValue([]),
    findByRoleAndOrg: jest.fn().mockResolvedValue([]),
  };
}

function makeMemberRepo(): any {
  return { findMemberUsers: jest.fn().mockResolvedValue([]) };
}

function makeNotificationService() {
  return { notifyNewFeedback: jest.fn().mockResolvedValue(undefined) };
}

const project = { id: "proj-1", name: "Product A", organizationId: "org-1" };

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe("FeedbackService.createIntegrationTicket", () => {
  let feedbackRepo: any;
  let service: FeedbackService;

  beforeEach(() => {
    jest.clearAllMocks();
    feedbackRepo = makeFeedbackRepo();
    service = new FeedbackService(
      feedbackRepo,
      makeHistoryRepo(),
      makeProjectRepo(),
      makeProjectService(),
      makeMemberRepo(),
      makeAuthRepo(),
      makeNotificationService()
    );
  });

  const payload = {
    type: "bug",
    title: "Export fails",
    description: "CSV export 500s",
    submitterName: "Jane Doe",
    submitterEmail: "jane@doms.example",
    externalRef: "DOMS-1001",
  };

  it("creates a ticket sourced as integration, direct to the product team", async () => {
    feedbackRepo.create.mockResolvedValue({ id: "fb-1", ...payload, createdAt: new Date() });

    const { feedback, created } = await service.createIntegrationTicket(project as any, payload);

    expect(created).toBe(true);
    expect(feedback.id).toBe("fb-1");
    expect(feedbackRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        source: FeedbackSource.INTEGRATION,
        clientCompanyId: null,
        supportStatus: null,
        externalRef: "DOMS-1001",
        status: FeedbackStatus.LOGGED,
      })
    );
  });

  it("returns the existing ticket instead of creating a duplicate when externalRef already exists", async () => {
    const existing = { id: "fb-existing", ...payload };
    feedbackRepo.findByProjectAndExternalRef.mockResolvedValue(existing);

    const { feedback, created } = await service.createIntegrationTicket(project as any, payload);

    expect(created).toBe(false);
    expect(feedback).toBe(existing);
    expect(feedbackRepo.create).not.toHaveBeenCalled();
  });

  it("resolves to the winning row instead of erroring on a concurrent-retry unique-violation race", async () => {
    const winner = { id: "fb-winner", ...payload };
    feedbackRepo.create.mockRejectedValue({ code: "23505" });
    // First lookup (pre-create) finds nothing; second (post-conflict) finds the winner.
    feedbackRepo.findByProjectAndExternalRef
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(winner);

    const { feedback, created } = await service.createIntegrationTicket(project as any, payload);

    expect(created).toBe(false);
    expect(feedback).toBe(winner);
  });

  it("still notifies the project team after a successful create", async () => {
    feedbackRepo.create.mockResolvedValue({ id: "fb-1", ...payload, createdAt: new Date() });
    const notificationService = makeNotificationService();
    const memberRepo = makeMemberRepo();
    const authRepo = makeAuthRepo();
    authRepo.findByRole.mockResolvedValue([{ id: "admin-1" }]);
    service = new FeedbackService(
      feedbackRepo,
      makeHistoryRepo(),
      makeProjectRepo(),
      makeProjectService(),
      memberRepo,
      authRepo,
      notificationService
    );

    await service.createIntegrationTicket(project as any, payload);
    await flush();

    expect(notificationService.notifyNewFeedback).toHaveBeenCalled();
  });
});

describe("toExternalStatus", () => {
  it("collapses internal triage stages into the customer-facing status", () => {
    expect(toExternalStatus(FeedbackStatus.LOGGED)).toBe(ExternalFeedbackStatus.RECEIVED);
    expect(toExternalStatus(FeedbackStatus.ACKNOWLEDGED)).toBe(ExternalFeedbackStatus.IN_PROGRESS);
    expect(toExternalStatus(FeedbackStatus.ASSIGNED)).toBe(ExternalFeedbackStatus.IN_PROGRESS);
    expect(toExternalStatus(FeedbackStatus.INVESTIGATING)).toBe(ExternalFeedbackStatus.IN_PROGRESS);
    // Deliberate: internally "resolved" hasn't been confirmed by the submitter
    // yet, so it must NOT read as done externally.
    expect(toExternalStatus(FeedbackStatus.RESOLVED)).toBe(ExternalFeedbackStatus.IN_PROGRESS);
    expect(toExternalStatus(FeedbackStatus.AWAITING_CONFIRMATION)).toBe(
      ExternalFeedbackStatus.PENDING_YOUR_CONFIRMATION
    );
    expect(toExternalStatus(FeedbackStatus.CLOSED)).toBe(ExternalFeedbackStatus.RESOLVED);
  });
});
