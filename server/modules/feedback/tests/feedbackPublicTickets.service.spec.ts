// modules/feedback/tests/feedbackPublicTickets.service.spec.ts
// Coverage for a partner's own dashboard listing everything raised against
// its project's (or client company's) public form token.

jest.mock("../../clientCompany/repositories/clientCompany.repository", () => ({
  ClientCompanyRepository: { Instance: { findByFeedbackToken: jest.fn() } },
}));

import { FeedbackService } from "../services/feedback.service";

const { ClientCompanyRepository } = require("../../clientCompany/repositories/clientCompany.repository");
const { FeedbackStatus, SupportStatus } = require("../../../config/constants");

function makeFeedbackRepo() {
  return {
    fetchPaginated: jest.fn().mockResolvedValue({ data: [], meta: { page: 1, limit: 20, total: 0 } }),
  };
}

function makeProjectRepo() {
  return { findByFeedbackToken: jest.fn(), findById: jest.fn() };
}

function makeService({
  feedbackRepo = makeFeedbackRepo(),
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
    {} as any
  );
  return { service, feedbackRepo, projectRepo };
}

const ticket = {
  id: "fb-1",
  ticketNumber: 42,
  clientCompany: null,
  clientCompanyId: null,
  supportStatus: null,
  type: "bug",
  title: "Export fails",
  description: "The CSV export is missing the last column.",
  suiteName: null,
  submitterName: "Jane Doe",
  submitterEmail: "jane@example.com",
  submitterPhone: null,
  status: FeedbackStatus.ACKNOWLEDGED,
  attachments: [],
  rating: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  statusUpdatedAt: null,
};

describe("FeedbackService.listPublicTickets", () => {
  beforeEach(() => jest.clearAllMocks());

  it("404s when the token doesn't resolve to a project or company", async () => {
    const { service, projectRepo } = makeService();
    projectRepo.findByFeedbackToken.mockResolvedValue(null);
    (ClientCompanyRepository.Instance.findByFeedbackToken as jest.Mock).mockResolvedValue(null);

    await expect(service.listPublicTickets("bad-token", {})).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("scopes a project-level token to that project, not a clientCompanyId", async () => {
    const feedbackRepo = makeFeedbackRepo();
    const { service, projectRepo } = makeService({ feedbackRepo });
    projectRepo.findByFeedbackToken.mockResolvedValue({ id: "proj-1", deletedAt: null });

    await service.listPublicTickets("proj-token", { page: 2, limit: 10 });

    expect(feedbackRepo.fetchPaginated).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "proj-1", page: 2, limit: 10 })
    );
    expect(feedbackRepo.fetchPaginated.mock.calls[0][0]).not.toHaveProperty("clientCompanyId");
  });

  it("scopes a client-company token to that company, not a projectId", async () => {
    const feedbackRepo = makeFeedbackRepo();
    const { service, projectRepo } = makeService({ feedbackRepo });
    projectRepo.findByFeedbackToken.mockResolvedValue(null);
    (ClientCompanyRepository.Instance.findByFeedbackToken as jest.Mock).mockResolvedValue({
      id: "cc-1",
      projectId: "proj-1",
      deletedAt: null,
    });
    projectRepo.findById.mockResolvedValue({ id: "proj-1", deletedAt: null });

    await service.listPublicTickets("company-token", { type: "bug" });

    expect(feedbackRepo.fetchPaginated).toHaveBeenCalledWith(
      expect.objectContaining({ clientCompanyId: "cc-1", type: "bug" })
    );
    expect(feedbackRepo.fetchPaginated.mock.calls[0][0]).not.toHaveProperty("projectId");
  });

  it("maps results through the collapsed, submitter-safe DTO", async () => {
    const feedbackRepo = makeFeedbackRepo();
    feedbackRepo.fetchPaginated.mockResolvedValue({
      data: [ticket],
      meta: { page: 1, limit: 20, total: 1 },
    });
    const { service, projectRepo } = makeService({ feedbackRepo });
    projectRepo.findByFeedbackToken.mockResolvedValue({ id: "proj-1", deletedAt: null });

    const result = await service.listPublicTickets("proj-token", {});

    expect(result.meta).toEqual({ page: 1, limit: 20, total: 1 });
    expect(result.data).toEqual([
      expect.objectContaining({
        id: "fb-1",
        ticketCode: expect.stringContaining("TKT-"),
        submitterName: "Jane Doe",
        submitterEmail: "jane@example.com",
        description: "The CSV export is missing the last column.",
        status: "in_progress",
      }),
    ]);
    // No internal staff identities leak through.
    expect(result.data[0]).not.toHaveProperty("assignedSupporterName");
    expect(result.data[0]).not.toHaveProperty("escalatedByName");
  });

  it("collapses an escalated company ticket's status the same way toMyTicketResponse does", async () => {
    const feedbackRepo = makeFeedbackRepo();
    feedbackRepo.fetchPaginated.mockResolvedValue({
      data: [
        {
          ...ticket,
          clientCompanyId: "cc-1",
          supportStatus: SupportStatus.RESOLVED,
          status: FeedbackStatus.LOGGED,
        },
      ],
      meta: { page: 1, limit: 20, total: 1 },
    });
    const { service, projectRepo } = makeService({ feedbackRepo });
    projectRepo.findByFeedbackToken.mockResolvedValue(null);
    (ClientCompanyRepository.Instance.findByFeedbackToken as jest.Mock).mockResolvedValue({
      id: "cc-1",
      projectId: "proj-1",
      deletedAt: null,
    });
    projectRepo.findById.mockResolvedValue({ id: "proj-1", deletedAt: null });

    const result = await service.listPublicTickets("company-token", {});

    expect(result.data[0].status).toBe("resolved");
  });
});
