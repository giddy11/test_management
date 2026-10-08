// modules/feedback/tests/feedbackMyTickets.service.spec.ts
// Coverage for a ticket submitter's own history view (no account): request a
// code by email, trade it for the list (reusable until it expires, not
// single-use), and the collapsed customer-facing status mapping the list is
// rendered with.

jest.mock("../../../shared/utils/mailer", () => ({
  sendTicketLookupCodeEmail: jest.fn().mockResolvedValue(undefined),
}));

import { FeedbackService } from "../services/feedback.service";
import { toSubmitterStatus, toMyTicketResponse, SubmitterTicketStatus } from "../dto/feedback.dto";

const { sendTicketLookupCodeEmail } = require("../../../shared/utils/mailer");
const { FeedbackStatus, SupportStatus } = require("../../../config/constants");
const { env } = require("../../../config/env");

function makeLookupCodeRepo() {
  return {
    invalidateAllButNewest: jest.fn().mockResolvedValue(undefined),
    save: jest.fn().mockResolvedValue({ id: "code-1" }),
    findActive: jest.fn(),
  };
}

function makeFeedbackRepo() {
  return {
    findBySubmitterEmail: jest.fn().mockResolvedValue([]),
    findById: jest.fn(),
    update: jest.fn(),
  };
}

function makeProjectRepo() {
  return {
    findById: jest.fn().mockResolvedValue({ id: "proj-1", name: "Product A", organizationId: "org-1" }),
  };
}

function makeService({
  feedbackRepo = makeFeedbackRepo(),
  lookupCodeRepo = makeLookupCodeRepo(),
  projectRepo = makeProjectRepo(),
} = {}) {
  const service = new FeedbackService(
    feedbackRepo as any,
    {} as any,
    projectRepo as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    lookupCodeRepo as any
  );
  return { service, feedbackRepo, lookupCodeRepo, projectRepo };
}

describe("FeedbackService.requestMyTicketsCode", () => {
  beforeEach(() => jest.clearAllMocks());

  it("keeps the few newest codes live, saves a new hashed one, and emails it", async () => {
    const { service, lookupCodeRepo } = makeService();

    await service.requestMyTicketsCode("jane@example.com");

    // Earlier codes aren't all cancelled — only those beyond the newest few.
    expect(lookupCodeRepo.invalidateAllButNewest).toHaveBeenCalledWith("jane@example.com", 4);
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

  it("uses its own long-lived TTL, not the short auth-OTP one", async () => {
    const { service, lookupCodeRepo } = makeService();

    const before = Date.now();
    await service.requestMyTicketsCode("jane@example.com");

    const [savedArg] = (lookupCodeRepo.save as jest.Mock).mock.calls[0];
    const ttlMs = savedArg.expiresAt.getTime() - before;
    const expectedMs = env.ticketLookupCodeTtlMinutes * 60 * 1000;
    // A couple seconds of slack for test execution time.
    expect(Math.abs(ttlMs - expectedMs)).toBeLessThan(5000);
    expect(env.ticketLookupCodeTtlMinutes).toBeGreaterThan(env.otpTtlMinutes);
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

  it("returns the submitter's tickets without consuming the code", async () => {
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

  it("can be called again with the same code — it's reusable, not single-use", async () => {
    const { service, lookupCodeRepo } = makeService();
    lookupCodeRepo.findActive.mockResolvedValue({ id: "code-1" });

    await service.listMyTickets("jane@example.com", "123456");
    await service.listMyTickets("jane@example.com", "123456");

    expect(lookupCodeRepo.findActive).toHaveBeenCalledTimes(2);
  });
});

describe("FeedbackService.submitRating", () => {
  beforeEach(() => jest.clearAllMocks());

  const resolvedTicket = {
    id: "fb-1",
    ticketNumber: 42,
    projectId: "proj-1",
    project: { name: "Product A" },
    clientCompany: null,
    clientCompanyId: null,
    supportStatus: null,
    status: FeedbackStatus.CLOSED,
    type: "bug",
    title: "Export fails",
    submitterEmail: "jane@example.com",
    rating: null,
    deletedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    statusUpdatedAt: null,
  };

  it("401s on an invalid or expired code", async () => {
    const { service, lookupCodeRepo } = makeService();
    lookupCodeRepo.findActive.mockResolvedValue(null);

    await expect(
      service.submitRating("fb-1", "jane@example.com", "000000", 5)
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it("404s when the ticket belongs to a different email", async () => {
    const feedbackRepo = makeFeedbackRepo();
    feedbackRepo.findById.mockResolvedValue({ ...resolvedTicket, submitterEmail: "other@example.com" });
    const { service, lookupCodeRepo } = makeService({ feedbackRepo });
    lookupCodeRepo.findActive.mockResolvedValue({ id: "code-1" });

    await expect(
      service.submitRating("fb-1", "jane@example.com", "123456", 5)
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(feedbackRepo.update).not.toHaveBeenCalled();
  });

  it("422s when the ticket isn't resolved yet", async () => {
    const feedbackRepo = makeFeedbackRepo();
    feedbackRepo.findById.mockResolvedValue({ ...resolvedTicket, status: FeedbackStatus.INVESTIGATING });
    const { service, lookupCodeRepo } = makeService({ feedbackRepo });
    lookupCodeRepo.findActive.mockResolvedValue({ id: "code-1" });

    await expect(
      service.submitRating("fb-1", "jane@example.com", "123456", 5)
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(feedbackRepo.update).not.toHaveBeenCalled();
  });

  it("409s when the ticket has already been rated", async () => {
    const feedbackRepo = makeFeedbackRepo();
    feedbackRepo.findById.mockResolvedValue({ ...resolvedTicket, rating: 4 });
    const { service, lookupCodeRepo } = makeService({ feedbackRepo });
    lookupCodeRepo.findActive.mockResolvedValue({ id: "code-1" });

    await expect(
      service.submitRating("fb-1", "jane@example.com", "123456", 5)
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(feedbackRepo.update).not.toHaveBeenCalled();
  });

  it("saves the rating once resolved and unrated", async () => {
    const feedbackRepo = makeFeedbackRepo();
    feedbackRepo.findById.mockResolvedValue(resolvedTicket);
    feedbackRepo.update.mockResolvedValue({ ...resolvedTicket, rating: 5 });
    const { service, lookupCodeRepo } = makeService({ feedbackRepo });
    lookupCodeRepo.findActive.mockResolvedValue({ id: "code-1" });

    const result = await service.submitRating("fb-1", "jane@example.com", "123456", 5);

    expect(feedbackRepo.update).toHaveBeenCalledWith("fb-1", { rating: 5 });
    expect(result.rating).toBe(5);
  });

  it("also works for a company-routed ticket resolved by IT support", async () => {
    const feedbackRepo = makeFeedbackRepo();
    feedbackRepo.findById.mockResolvedValue({
      ...resolvedTicket,
      status: FeedbackStatus.LOGGED,
      clientCompanyId: "company-1",
      supportStatus: SupportStatus.RESOLVED,
    });
    feedbackRepo.update.mockResolvedValue({ ...resolvedTicket, rating: 3 });
    const { service, lookupCodeRepo } = makeService({ feedbackRepo });
    lookupCodeRepo.findActive.mockResolvedValue({ id: "code-1" });

    await expect(service.submitRating("fb-1", "jane@example.com", "123456", 3)).resolves.toBeDefined();
    expect(feedbackRepo.update).toHaveBeenCalledWith("fb-1", { rating: 3 });
  });
});

describe("toSubmitterStatus", () => {
  it("collapses direct (non-company) internal triage stages", () => {
    const fb = (status: string) => ({ status, clientCompanyId: null, supportStatus: null });
    expect(toSubmitterStatus(fb(FeedbackStatus.LOGGED))).toBe(SubmitterTicketStatus.RECEIVED);
    expect(toSubmitterStatus(fb(FeedbackStatus.ACKNOWLEDGED))).toBe(SubmitterTicketStatus.IN_PROGRESS);
    // Deliberate: internally "resolved" isn't shown as done until the team
    // actually closes it.
    expect(toSubmitterStatus(fb(FeedbackStatus.RESOLVED))).toBe(SubmitterTicketStatus.IN_PROGRESS);
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
    // Deliberate: the IT tier has no confirmation gate — resolved reads as
    // done for the submitter immediately, no interim "pending" stage.
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

describe("toMyTicketResponse note", () => {
  const base = {
    id: "fb-1",
    ticketNumber: 42,
    project: { name: "Product A" },
    clientCompany: null,
    type: "bug",
    title: "Export fails",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    statusUpdatedAt: null,
  };

  it("surfaces the IT supporter's note during working-stage progression", () => {
    const fb: any = {
      ...base,
      clientCompanyId: "company-1",
      supportStatus: SupportStatus.ACKNOWLEDGED,
      status: FeedbackStatus.LOGGED,
      supportResponse: "Looking into it now.",
    };
    expect(toMyTicketResponse(fb).note).toBe("Looking into it now.");
  });

  it("hides the internal escalation note until the submitter has been relayed a fix", () => {
    const fb: any = {
      ...base,
      clientCompanyId: "company-1",
      supportStatus: SupportStatus.ESCALATED,
      status: FeedbackStatus.INVESTIGATING,
      supportResponse: "Internal context for the product team.",
      submitterNotifiedAt: null,
    };
    expect(toMyTicketResponse(fb).note).toBeNull();
  });

  it("surfaces the relayed note once the submitter has been notified post-escalation", () => {
    const fb: any = {
      ...base,
      clientCompanyId: "company-1",
      supportStatus: SupportStatus.ESCALATED,
      status: FeedbackStatus.CLOSED,
      supportResponse: "All fixed now!",
      submitterNotifiedAt: new Date("2026-01-05T00:00:00.000Z"),
    };
    expect(toMyTicketResponse(fb).note).toBe("All fixed now!");
  });

  it("uses adminResponse for a direct (non-company) submission", () => {
    const fb: any = {
      ...base,
      clientCompanyId: null,
      supportStatus: null,
      status: FeedbackStatus.ACKNOWLEDGED,
      adminResponse: "We're on it.",
    };
    expect(toMyTicketResponse(fb).note).toBe("We're on it.");
  });
});

describe("toMyTicketResponse feedbackToken", () => {
  const base = {
    id: "fb-1",
    ticketNumber: 42,
    type: "bug",
    title: "Export fails",
    status: FeedbackStatus.LOGGED,
    supportStatus: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    statusUpdatedAt: null,
  };

  it("uses the project's form link for a direct submission", () => {
    const fb: any = {
      ...base,
      clientCompanyId: null,
      clientCompany: null,
      project: { name: "Product A", feedbackToken: "proj-token" },
    };
    expect(toMyTicketResponse(fb).feedbackToken).toBe("proj-token");
  });

  it("uses the client company's form link for a company-routed ticket", () => {
    const fb: any = {
      ...base,
      clientCompanyId: "company-1",
      clientCompany: { name: "Acme", feedbackToken: "company-token" },
      project: { name: "Product A", feedbackToken: "proj-token" },
    };
    expect(toMyTicketResponse(fb).feedbackToken).toBe("company-token");
  });

  it("is null once the relevant link has been disabled", () => {
    const fb: any = {
      ...base,
      clientCompanyId: "company-1",
      clientCompany: { name: "Acme", feedbackToken: null },
      project: { name: "Product A", feedbackToken: "proj-token" },
    };
    expect(toMyTicketResponse(fb).feedbackToken).toBeNull();
  });
});
