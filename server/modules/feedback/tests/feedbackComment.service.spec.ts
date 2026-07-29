// modules/feedback/tests/feedbackComment.service.spec.ts
// Coverage for the ticket comment thread's access rules: staff gating per
// tier (mirrors FeedbackService.manageFeedback / FeedbackSupportService's
// getOwnItem+getAssignedItem), the submitter's OTP-code credential (same as
// "My Tickets"), the escalation visibility gate (mirrors toMyTicketNote), and
// which Cloudinary pipeline an attachment goes through by mimetype. The
// thread itself lives in Firestore (see feedbackComment.repository.ts) — the
// repo is mocked here the same way every Firestore-backed repo is mocked
// elsewhere in this codebase (plain jest.fn()s, no real Firestore).

jest.mock("../../../shared/utils/mailer", () => ({
  sendFeedbackCommentEmail: jest.fn().mockResolvedValue(undefined),
}));

import { FeedbackCommentService } from "../services/feedbackComment.service";

const { UserRole, SupportStatus } = require("../../../config/constants");

function makeFeedbackRepo() {
  return { findById: jest.fn(), incrementCommentCount: jest.fn().mockResolvedValue(undefined) };
}

function makeCommentRepo() {
  return {
    findByFeedback: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockImplementation((data) => Promise.resolve({ id: "c-1", ...data })),
  };
}

function makeLookupCodeRepo() {
  return { findActive: jest.fn() };
}

function makeProjectRepo() {
  return { findById: jest.fn().mockResolvedValue({ id: "proj-1", name: "Product A", organizationId: "org-1" }) };
}

function makeProjectService() {
  return {
    getProject: jest.fn().mockResolvedValue({ id: "proj-1", name: "Product A", organizationId: "org-1" }),
    canManageProject: jest.fn().mockResolvedValue(false),
  };
}

function makeMemberRepo() {
  return { findMemberUsers: jest.fn().mockResolvedValue([]) };
}

function makeCompanyRepo() {
  return { findById: jest.fn().mockResolvedValue({ id: "company-1", name: "Acme" }) };
}

function makeAuthRepo() {
  return {
    findUserById: jest.fn().mockResolvedValue({ id: "admin-1", firstName: "Ada", lastName: "Min", email: "ada@example.com" }),
    findByRoleAndOrg: jest.fn().mockResolvedValue([]),
  };
}

function makeUserRepo() {
  return { findById: jest.fn(), findByClientCompany: jest.fn().mockResolvedValue([]) };
}

function makeNotificationService() {
  return { notifyFeedbackComment: jest.fn().mockResolvedValue(undefined) };
}

function makeStorage() {
  return {
    uploadImage: jest.fn().mockResolvedValue({ url: "https://cdn/img.png", publicId: "img-pub-1", bytes: 10 }),
    uploadRaw: jest.fn().mockResolvedValue({ url: "https://cdn/doc.pdf", publicId: "doc-pub-1", bytes: 10 }),
  };
}

const directTicket = {
  id: "fb-1",
  projectId: "proj-1",
  clientCompanyId: null,
  supportStatus: null,
  escalatedById: null,
  escalatedBy: null,
  submitterEmail: "user@example.com",
  submitterName: "End User",
  submitterNotifiedAt: null,
  title: "Broken export",
  assignees: [],
  deletedAt: null,
};

const supportOwnedTicket = {
  ...directTicket,
  id: "fb-2",
  clientCompanyId: "company-1",
  supportStatus: SupportStatus.INVESTIGATING,
  assignedSupporterId: "sup-1",
};

const escalatedUnrelayedTicket = {
  ...directTicket,
  id: "fb-3",
  clientCompanyId: "company-1",
  supportStatus: SupportStatus.ESCALATED,
  escalatedById: "sup-1",
  escalatedBy: { id: "sup-1", firstName: "Sam", lastName: "Support", email: "sam@client.co" },
  submitterNotifiedAt: null,
};

const escalatedRelayedTicket = { ...escalatedUnrelayedTicket, id: "fb-4", submitterNotifiedAt: new Date() };

function makeService(overrides: Record<string, any> = {}) {
  const deps = {
    feedbackRepo: makeFeedbackRepo(),
    commentRepo: makeCommentRepo(),
    lookupCodeRepo: makeLookupCodeRepo(),
    projectRepo: makeProjectRepo(),
    projectService: makeProjectService(),
    memberRepo: makeMemberRepo(),
    companyRepo: makeCompanyRepo(),
    authRepo: makeAuthRepo(),
    userRepo: makeUserRepo(),
    notificationService: makeNotificationService(),
    storage: makeStorage(),
    ...overrides,
  };
  const service = new FeedbackCommentService(
    deps.feedbackRepo as any,
    deps.commentRepo as any,
    deps.lookupCodeRepo as any,
    deps.projectRepo as any,
    deps.projectService as any,
    deps.memberRepo as any,
    deps.companyRepo as any,
    deps.authRepo as any,
    deps.userRepo as any,
    deps.notificationService as any,
    deps.storage as any
  );
  return { service, ...deps };
}

const admin = { id: "admin-1", role: UserRole.ADMIN, organizationId: "org-1" };
const plainUser = { id: "user-1", role: UserRole.USER, organizationId: "org-1" };
const supporter = { id: "sup-1", role: UserRole.IT_SUPPORT, clientCompanyId: "company-1" };
const otherSupporter = { id: "sup-2", role: UserRole.IT_SUPPORT, clientCompanyId: "company-1", isSupportLead: false };
const supportLead = { id: "lead-1", role: UserRole.IT_SUPPORT, clientCompanyId: "company-1", isSupportLead: true };

describe("FeedbackCommentService — staff access (product tier)", () => {
  it("lets an admin/manager post even without being an assignee", async () => {
    const { service, feedbackRepo, projectService } = makeService();
    projectService.canManageProject.mockResolvedValue(true);
    feedbackRepo.findById.mockResolvedValue(directTicket);

    await expect(service.addForStaff(admin, "fb-1", "Can you send a screenshot?")).resolves.toBeDefined();
  });

  it("rejects a plain user who is neither a manager nor an assignee", async () => {
    const { service, feedbackRepo, projectService } = makeService();
    feedbackRepo.findById.mockResolvedValue(directTicket);
    projectService.canManageProject.mockResolvedValue(false);

    await expect(service.addForStaff(plainUser, "fb-1", "hi")).rejects.toMatchObject({ statusCode: 403 });
  });

  it("lets an assignee post even without manage rights", async () => {
    const { service, feedbackRepo, projectService } = makeService();
    projectService.canManageProject.mockResolvedValue(false);
    feedbackRepo.findById.mockResolvedValue({ ...directTicket, assignees: [{ id: plainUser.id }] });

    await expect(service.addForStaff(plainUser, "fb-1", "here you go")).resolves.toBeDefined();
  });

  it("lets any project member read the thread even if they can't post to it", async () => {
    const { service, feedbackRepo, projectService } = makeService();
    feedbackRepo.findById.mockResolvedValue(directTicket);
    projectService.canManageProject.mockResolvedValue(false);

    await expect(service.listForStaff(plainUser, "fb-1")).resolves.toEqual([]);
  });

  it("hides an IT-support-owned (pre-escalation) ticket from product-tier staff", async () => {
    const { service, feedbackRepo } = makeService();
    feedbackRepo.findById.mockResolvedValue(supportOwnedTicket);

    await expect(service.listForStaff(admin, "fb-2")).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("FeedbackCommentService — staff access (IT-support tier)", () => {
  it("rejects a supporter from a different company", async () => {
    const { service, feedbackRepo } = makeService();
    feedbackRepo.findById.mockResolvedValue(supportOwnedTicket);
    const outsider = { id: "sup-9", role: UserRole.IT_SUPPORT, clientCompanyId: "company-2" };

    await expect(service.listForStaff(outsider, "fb-2")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("lets any of the company's supporters read the thread", async () => {
    const { service, feedbackRepo } = makeService();
    feedbackRepo.findById.mockResolvedValue(supportOwnedTicket);

    await expect(service.listForStaff(otherSupporter, "fb-2")).resolves.toEqual([]);
  });

  it("rejects a non-lead supporter the ticket isn't assigned to when posting", async () => {
    const { service, feedbackRepo } = makeService();
    feedbackRepo.findById.mockResolvedValue(supportOwnedTicket);

    await expect(service.addForStaff(otherSupporter, "fb-2", "hi")).rejects.toMatchObject({ statusCode: 403 });
  });

  it("lets the assigned supporter post", async () => {
    const { service, feedbackRepo } = makeService();
    feedbackRepo.findById.mockResolvedValue(supportOwnedTicket);

    await expect(service.addForStaff(supporter, "fb-2", "hi")).resolves.toBeDefined();
  });

  it("lets a lead post even when the ticket isn't assigned to them", async () => {
    const { service, feedbackRepo } = makeService();
    feedbackRepo.findById.mockResolvedValue(supportOwnedTicket);

    await expect(service.addForStaff(supportLead, "fb-2", "hi")).resolves.toBeDefined();
  });
});

describe("FeedbackCommentService — submitter access", () => {
  it("401s on an invalid or expired code", async () => {
    const { service, lookupCodeRepo } = makeService();
    lookupCodeRepo.findActive.mockResolvedValue(null);

    await expect(service.listForSubmitter("fb-1", "user@example.com", "000000")).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it("404s when the code's email doesn't own this ticket", async () => {
    const { service, feedbackRepo, lookupCodeRepo } = makeService();
    lookupCodeRepo.findActive.mockResolvedValue({ id: "code-1" });
    feedbackRepo.findById.mockResolvedValue(directTicket);

    await expect(service.listForSubmitter("fb-1", "someone-else@example.com", "123456")).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("matches the submitter email case-insensitively", async () => {
    const { service, feedbackRepo, lookupCodeRepo } = makeService();
    lookupCodeRepo.findActive.mockResolvedValue({ id: "code-1" });
    feedbackRepo.findById.mockResolvedValue(directTicket);

    await expect(service.listForSubmitter("fb-1", "USER@EXAMPLE.COM", "123456")).resolves.toEqual([]);
  });

  it("blocks the true submitter from an escalated ticket until it's been relayed", async () => {
    const { service, feedbackRepo, lookupCodeRepo } = makeService();
    lookupCodeRepo.findActive.mockResolvedValue({ id: "code-1" });
    feedbackRepo.findById.mockResolvedValue(escalatedUnrelayedTicket);

    await expect(service.listForSubmitter("fb-3", "user@example.com", "123456")).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("lets the submitter back in once support has relayed a fix", async () => {
    const { service, feedbackRepo, lookupCodeRepo } = makeService();
    lookupCodeRepo.findActive.mockResolvedValue({ id: "code-1" });
    feedbackRepo.findById.mockResolvedValue(escalatedRelayedTicket);

    await expect(service.listForSubmitter("fb-4", "user@example.com", "123456")).resolves.toEqual([]);
  });

  it("never blocks a direct (non-company) ticket on the escalation gate", async () => {
    const { service, feedbackRepo, lookupCodeRepo } = makeService();
    lookupCodeRepo.findActive.mockResolvedValue({ id: "code-1" });
    feedbackRepo.findById.mockResolvedValue(directTicket);

    await expect(service.listForSubmitter("fb-1", "user@example.com", "123456")).resolves.toEqual([]);
  });
});

describe("FeedbackCommentService — attachment mimetype branching", () => {
  const file = (mimetype: string, name = "file") => ({
    buffer: Buffer.from("x"),
    originalname: name,
    mimetype,
    size: 10,
  });

  it("routes an image attachment through the image pipeline and embeds it on the comment doc", async () => {
    const { service, feedbackRepo, commentRepo, storage, projectService } = makeService();
    projectService.canManageProject.mockResolvedValue(true);
    feedbackRepo.findById.mockResolvedValue(directTicket);

    await service.addForStaff(admin, "fb-1", "see attached", [file("image/png", "shot.png")]);

    expect(storage.uploadImage).toHaveBeenCalledTimes(1);
    expect(storage.uploadRaw).not.toHaveBeenCalled();
    expect(commentRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: expect.arrayContaining([expect.objectContaining({ name: "shot.png", mimeType: "image/png" })]),
      })
    );
  });

  it("routes a document attachment through the raw pipeline", async () => {
    const { service, feedbackRepo, storage, projectService } = makeService();
    projectService.canManageProject.mockResolvedValue(true);
    feedbackRepo.findById.mockResolvedValue(directTicket);

    await service.addForStaff(admin, "fb-1", "see attached", [file("application/pdf", "invoice.pdf")]);

    expect(storage.uploadRaw).toHaveBeenCalledTimes(1);
    expect(storage.uploadImage).not.toHaveBeenCalled();
  });

  it("rejects more than the per-comment attachment limit before creating anything", async () => {
    const { service, feedbackRepo, commentRepo, projectService } = makeService();
    projectService.canManageProject.mockResolvedValue(true);
    feedbackRepo.findById.mockResolvedValue(directTicket);
    const files = Array.from({ length: 6 }, (_, i) => file("image/png", `shot-${i}.png`));

    await expect(service.addForStaff(admin, "fb-1", "lots of shots", files)).rejects.toMatchObject({
      statusCode: 422,
    });
    expect(commentRepo.create).not.toHaveBeenCalled();
  });
});

describe("FeedbackCommentService — submitter reply notifies the right staff", () => {
  it("notifies the assigned supporter for an IT-support-owned ticket", async () => {
    const { service, feedbackRepo, lookupCodeRepo, userRepo, notificationService } = makeService();
    lookupCodeRepo.findActive.mockResolvedValue({ id: "code-1" });
    feedbackRepo.findById.mockResolvedValue(supportOwnedTicket);
    userRepo.findById.mockResolvedValue({ id: "sup-1", email: "sam@client.co", firstName: "Sam" });

    await service.addForSubmitter("fb-2", "user@example.com", "123456", "here's more info", []);

    expect(notificationService.notifyFeedbackComment).toHaveBeenCalledWith(
      [expect.objectContaining({ id: "sup-1" })],
      expect.objectContaining({ support: true })
    );
  });

  it("notifies org admins + project members for a product-tier ticket", async () => {
    const { service, feedbackRepo, lookupCodeRepo, authRepo, memberRepo, notificationService } = makeService();
    lookupCodeRepo.findActive.mockResolvedValue({ id: "code-1" });
    feedbackRepo.findById.mockResolvedValue(directTicket);
    authRepo.findByRoleAndOrg.mockResolvedValue([{ id: "admin-1", email: "ada@example.com", firstName: "Ada" }]);
    memberRepo.findMemberUsers.mockResolvedValue([{ id: "member-1", email: "m@example.com", firstName: "Mo" }]);

    await service.addForSubmitter("fb-1", "user@example.com", "123456", "here's more info", []);

    expect(notificationService.notifyFeedbackComment).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: "admin-1" }),
        expect.objectContaining({ id: "member-1" }),
      ]),
      expect.objectContaining({ support: false })
    );
  });
});
