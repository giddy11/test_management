// modules/feedback/tests/feedbackIntegration.service.spec.ts
// Coverage for the partner integration API's create path: idempotent
// creation via externalRef (including the concurrent-retry race), routing to
// the key's owning client company's IT queue (not the product team), and the
// collapsed external status mapping consumed by GET /integrations/tickets.

jest.mock("../../../shared/utils/mailer", () => ({
  sendFeedbackReceivedEmail: jest.fn().mockResolvedValue(undefined),
  sendFeedbackStatusEmail: jest.fn().mockResolvedValue(undefined),
  sendFeedbackConfirmationReceivedEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../services/feedbackSupport.service", () => ({
  FeedbackSupportService: { Instance: { notifyQueueItem: jest.fn().mockResolvedValue(undefined) } },
}));

import { FeedbackService } from "../services/feedback.service";
import { toExternalStatus, ExternalFeedbackStatus } from "../dto/feedback.dto";
import { FeedbackSupportService } from "../services/feedbackSupport.service";

const { FeedbackStatus, FeedbackSource, SupportStatus } = require("../../../config/constants");

function makeFeedbackRepo() {
  return {
    create: jest.fn(),
    findById: jest.fn(),
    findByCompanyAndExternalRef: jest.fn().mockResolvedValue(null),
  };
}

function makeHistoryRepo(): any {
  return { create: jest.fn().mockResolvedValue({}) };
}

function makeProjectRepo(): any {
  return { findById: jest.fn().mockResolvedValue(project) };
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

const project = { id: "proj-1", name: "Product A", organizationId: "org-1", deletedAt: null };
const company = { id: "company-1", projectId: "proj-1", name: "DOMS" };

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

  it("creates a ticket sourced as integration, routed to the company's IT queue", async () => {
    feedbackRepo.create.mockResolvedValue({ id: "fb-1", ticketNumber: 42, ...payload, createdAt: new Date() });

    const { feedback, created } = await service.createIntegrationTicket(company as any, payload);

    expect(created).toBe(true);
    expect(feedback.id).toBe("fb-1");
    expect(feedbackRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        source: FeedbackSource.INTEGRATION,
        clientCompanyId: company.id,
        supportStatus: SupportStatus.LOGGED,
        externalRef: "DOMS-1001",
        status: FeedbackStatus.LOGGED,
      })
    );
  });

  it("returns the existing ticket instead of creating a duplicate when externalRef already exists for this company", async () => {
    const existing = { id: "fb-existing", ticketNumber: 41, ...payload };
    feedbackRepo.findByCompanyAndExternalRef.mockResolvedValue(existing);

    const { feedback, created } = await service.createIntegrationTicket(company as any, payload);

    expect(created).toBe(false);
    expect(feedback).toBe(existing);
    expect(feedbackRepo.create).not.toHaveBeenCalled();
    expect(feedbackRepo.findByCompanyAndExternalRef).toHaveBeenCalledWith(company.id, "DOMS-1001");
  });

  it("resolves to the winning row instead of erroring on a concurrent-retry unique-violation race", async () => {
    const winner = { id: "fb-winner", ticketNumber: 43, ...payload };
    feedbackRepo.create.mockRejectedValue({ code: "23505" });
    // First lookup (pre-create) finds nothing; second (post-conflict) finds the winner.
    feedbackRepo.findByCompanyAndExternalRef
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(winner);

    const { feedback, created } = await service.createIntegrationTicket(company as any, payload);

    expect(created).toBe(false);
    expect(feedback).toBe(winner);
  });

  it("notifies the company's IT support queue, not the product team, after a successful create", async () => {
    feedbackRepo.create.mockResolvedValue({ id: "fb-1", ticketNumber: 42, ...payload, createdAt: new Date() });
    const notificationService = makeNotificationService();
    service = new FeedbackService(
      feedbackRepo,
      makeHistoryRepo(),
      makeProjectRepo(),
      makeProjectService(),
      makeMemberRepo(),
      makeAuthRepo(),
      notificationService
    );

    await service.createIntegrationTicket(company as any, payload);
    await flush();

    expect(FeedbackSupportService.Instance.notifyQueueItem).toHaveBeenCalledWith(
      company,
      expect.objectContaining({ id: "fb-1" }),
      project
    );
    // Direct-to-product-team notification must NOT fire for integration tickets.
    expect(notificationService.notifyNewFeedback).not.toHaveBeenCalled();
  });
});

describe("toExternalStatus", () => {
  it("collapses direct (non-company) internal triage stages into the customer-facing status", () => {
    const fb = (status: string) => ({ status, clientCompanyId: null, supportStatus: null });
    expect(toExternalStatus(fb(FeedbackStatus.LOGGED))).toBe(ExternalFeedbackStatus.RECEIVED);
    expect(toExternalStatus(fb(FeedbackStatus.ACKNOWLEDGED))).toBe(ExternalFeedbackStatus.IN_PROGRESS);
    expect(toExternalStatus(fb(FeedbackStatus.ASSIGNED))).toBe(ExternalFeedbackStatus.IN_PROGRESS);
    expect(toExternalStatus(fb(FeedbackStatus.INVESTIGATING))).toBe(ExternalFeedbackStatus.IN_PROGRESS);
    // Deliberate: internally "resolved" hasn't been confirmed by the submitter
    // yet, so it must NOT read as done externally.
    expect(toExternalStatus(fb(FeedbackStatus.RESOLVED))).toBe(ExternalFeedbackStatus.IN_PROGRESS);
    expect(toExternalStatus(fb(FeedbackStatus.AWAITING_CONFIRMATION))).toBe(
      ExternalFeedbackStatus.PENDING_YOUR_CONFIRMATION
    );
    expect(toExternalStatus(fb(FeedbackStatus.CLOSED))).toBe(ExternalFeedbackStatus.RESOLVED);
  });

  it("maps a company-routed ticket's IT-tier progress before escalation", () => {
    const fb = (supportStatus: string) => ({
      status: FeedbackStatus.LOGGED,
      clientCompanyId: "company-1",
      supportStatus,
    });
    expect(toExternalStatus(fb(SupportStatus.LOGGED))).toBe(ExternalFeedbackStatus.RECEIVED);
    expect(toExternalStatus(fb(SupportStatus.ACKNOWLEDGED))).toBe(ExternalFeedbackStatus.IN_PROGRESS);
    expect(toExternalStatus(fb(SupportStatus.INVESTIGATING))).toBe(ExternalFeedbackStatus.IN_PROGRESS);
    // IT support resolves directly, with no separate submitter-confirmation
    // step at that tier — unlike the product team's "resolved".
    expect(toExternalStatus(fb(SupportStatus.RESOLVED))).toBe(ExternalFeedbackStatus.RESOLVED);
  });

  it("falls back to the product-tier status once a company-routed ticket is escalated", () => {
    expect(
      toExternalStatus({
        status: FeedbackStatus.LOGGED,
        clientCompanyId: "company-1",
        supportStatus: SupportStatus.ESCALATED,
      })
    ).toBe(ExternalFeedbackStatus.RECEIVED);
    expect(
      toExternalStatus({
        status: FeedbackStatus.AWAITING_CONFIRMATION,
        clientCompanyId: "company-1",
        supportStatus: SupportStatus.ESCALATED,
      })
    ).toBe(ExternalFeedbackStatus.PENDING_YOUR_CONFIRMATION);
  });
});
