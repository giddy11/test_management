// modules/feedback/tests/feedbackMyTickets.service.spec.ts
// Coverage for a ticket submitter's own history view (no account): request a
// one-time code by email, trade it for the list, and the collapsed
// customer-facing status mapping the list is rendered with.

jest.mock("../../../shared/utils/mailer", () => ({
  sendTicketLookupCodeEmail: jest.fn().mockResolvedValue(undefined),
}));

import { FeedbackService } from "../services/feedback.service";
import { toSubmitterStatus, SubmitterTicketStatus } from "../dto/feedback.dto";

const { sendTicketLookupCodeEmail } = require("../../../shared/utils/mailer");
const { FeedbackStatus, SupportStatus } = require("../../../config/constants");

function makeLookupCodeRepo() {
  return {
    invalidateActive: jest.fn().mockResolvedValue(undefined),
    save: jest.fn().mockResolvedValue({ id: "code-1" }),
    findActive: jest.fn(),
    consume: jest.fn().mockResolvedValue(undefined),
  };
}

function makeFeedbackRepo() {
  return { findBySubmitterEmail: jest.fn().mockResolvedValue([]) };
}

function makeService({ feedbackRepo = makeFeedbackRepo(), lookupCodeRepo = makeLookupCodeRepo() } = {}) {
  const service = new FeedbackService(
    feedbackRepo as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    lookupCodeRepo as any
  );
  return { service, feedbackRepo, lookupCodeRepo };
}

describe("FeedbackService.requestMyTicketsCode", () => {
  beforeEach(() => jest.clearAllMocks());

  it("invalidates previous codes, saves a new hashed one, and emails it", async () => {
    const { service, lookupCodeRepo } = makeService();

    await service.requestMyTicketsCode("jane@example.com");

    expect(lookupCodeRepo.invalidateActive).toHaveBeenCalledWith("jane@example.com");
    expect(lookupCodeRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "jane@example.com",
        codeHash: expect.any(String),
        expiresAt: expect.any(Date),
      })
    );
    // The raw code is emailed, never the hash.
    const [, rawCode] = (sendTicketLookupCodeEmail as jest.Mock).mock.calls[0];
    const [savedArg] = (lookupCodeRepo.save as jest.Mock).mock.calls[0];
    expect(savedArg.codeHash).not.toBe(rawCode);
    expect(sendTicketLookupCodeEmail).toHaveBeenCalledWith("jane@example.com", expect.any(String));
  });
});

describe("FeedbackService.listMyTickets", () => {
  beforeEach(() => jest.clearAllMocks());

  it("401s on an invalid or expired code", async () => {
    const { service, lookupCodeRepo } = makeService();
    lookupCodeRepo.findActive.mockResolvedValue(null);

    await expect(service.listMyTickets("jane@example.com", "000000")).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it("consumes the code (single-use) and returns the submitter's tickets", async () => {
    const feedbackRepo = makeFeedbackRepo();
    feedbackRepo.findBySubmitterEmail.mockResolvedValue([
      {
        id: "fb-1",
        ticketNumber: 42,
        project: { name: "Product A" },
        clientCompany: null,
        clientCompanyId: null,
        supportStatus: null,
        type: "bug",
        title: "Export fails",
        status: FeedbackStatus.ACKNOWLEDGED,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        statusUpdatedAt: null,
      },
    ]);
    const { service, lookupCodeRepo } = makeService({ feedbackRepo });
    lookupCodeRepo.findActive.mockResolvedValue({ id: "code-1" });

    const result = await service.listMyTickets("jane@example.com", "123456");

    expect(lookupCodeRepo.consume).toHaveBeenCalledWith("code-1");
    expect(feedbackRepo.findBySubmitterEmail).toHaveBeenCalledWith("jane@example.com");
    expect(result).toEqual([
      expect.objectContaining({
        id: "fb-1",
        ticketNumber: 42,
        projectName: "Product A",
        status: SubmitterTicketStatus.IN_PROGRESS,
      }),
    ]);
  });
});

describe("toSubmitterStatus", () => {
  it("collapses direct (non-company) internal triage stages", () => {
    const fb = (status: string) => ({ status, clientCompanyId: null, supportStatus: null });
    expect(toSubmitterStatus(fb(FeedbackStatus.LOGGED))).toBe(SubmitterTicketStatus.RECEIVED);
    expect(toSubmitterStatus(fb(FeedbackStatus.ACKNOWLEDGED))).toBe(SubmitterTicketStatus.IN_PROGRESS);
    // Deliberate: internally "resolved" hasn't been confirmed by the submitter
    // yet, so it must NOT read as done externally.
    expect(toSubmitterStatus(fb(FeedbackStatus.RESOLVED))).toBe(SubmitterTicketStatus.IN_PROGRESS);
    expect(toSubmitterStatus(fb(FeedbackStatus.AWAITING_CONFIRMATION))).toBe(
      SubmitterTicketStatus.PENDING_YOUR_CONFIRMATION
    );
    expect(toSubmitterStatus(fb(FeedbackStatus.CLOSED))).toBe(SubmitterTicketStatus.RESOLVED);
  });

  it("maps a company-routed ticket's IT-tier progress before escalation", () => {
    const fb = (supportStatus: string) => ({
      status: FeedbackStatus.LOGGED,
      clientCompanyId: "company-1",
      supportStatus,
    });
    expect(toSubmitterStatus(fb(SupportStatus.LOGGED))).toBe(SubmitterTicketStatus.RECEIVED);
    expect(toSubmitterStatus(fb(SupportStatus.INVESTIGATING))).toBe(SubmitterTicketStatus.IN_PROGRESS);
    expect(toSubmitterStatus(fb(SupportStatus.RESOLVED))).toBe(SubmitterTicketStatus.RESOLVED);
  });

  it("falls back to the product-tier status once a company-routed ticket is escalated", () => {
    expect(
      toSubmitterStatus({
        status: FeedbackStatus.LOGGED,
        clientCompanyId: "company-1",
        supportStatus: SupportStatus.ESCALATED,
      })
    ).toBe(SubmitterTicketStatus.RECEIVED);
  });
});
