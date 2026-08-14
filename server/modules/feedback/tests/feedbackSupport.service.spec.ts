// modules/feedback/tests/feedbackSupport.service.spec.ts

// Keep tests hermetic — never touch SMTP.
jest.mock("../../../shared/utils/mail/support.mail", () => ({
  sendSupporterInviteEmail: jest.fn().mockResolvedValue(undefined),
  sendSupportQueueAlertEmail: jest.fn().mockResolvedValue(undefined),
  sendSupportStatusEmail: jest.fn().mockResolvedValue(undefined),
  sendSupportResolutionEmail: jest.fn().mockResolvedValue(undefined),
  sendFeedbackEscalatedAlertEmail: jest.fn().mockResolvedValue(undefined),
  sendSupportItemAssignedEmail: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../../shared/utils/mailer", () => ({
  sendFeedbackConfirmationReceivedEmail: jest.fn().mockResolvedValue(undefined),
}));

import { FeedbackSupportService } from "../services/feedbackSupport.service";

const { UserRole, FeedbackStatus, SupportStatus } = require("../../../config/constants");

function makeFeedbackRepo() {
  return {
    fetchPaginated: jest.fn().mockResolvedValue({ data: [], meta: {} }),
    findById: jest.fn(),
    update: jest.fn(),
    countOpenBySupporter: jest.fn().mockResolvedValue({}),
  };
}

function makeHistoryRepo() {
  return { create: jest.fn().mockResolvedValue({}) };
}

function makeSupportHistoryRepo() {
  return {
    create: jest.fn().mockResolvedValue({}),
    findByFeedback: jest.fn().mockResolvedValue([]),
  };
}

function makeCompanyRepo() {
  return {
    findById: jest.fn().mockResolvedValue({ id: "cc-1", name: "Client Co" }),
  };
}

function makeProjectRepo() {
  return {
    findById: jest
      .fn()
      .mockResolvedValue({ id: "proj-1", name: "Product A", organizationId: "org-1" }),
  };
}

function makeMemberRepo() {
  return { findMemberUsers: jest.fn().mockResolvedValue([]) };
}

function makeAuthRepo() {
  return {
    findByRole: jest.fn().mockResolvedValue([]),
    findByRoleAndOrg: jest.fn().mockResolvedValue([]),
    findUserById: jest
      .fn()
      .mockResolvedValue({ id: "sup-1", firstName: "Sam", lastName: "Support" }),
  };
}

function makeUserRepo() {
  return {
    findByClientCompany: jest.fn().mockResolvedValue([]),
    findById: jest.fn(),
  };
}

function makeNotificationService() {
  return {
    notifyFeedbackEscalated: jest.fn().mockResolvedValue(undefined),
    notifySupportQueueItem: jest.fn().mockResolvedValue(undefined),
    notifySupportItemAssigned: jest.fn().mockResolvedValue(undefined),
    notifyFeedbackConfirmed: jest.fn().mockResolvedValue(undefined),
  };
}

const supporter = { id: "sup-1", role: UserRole.IT_SUPPORT, clientCompanyId: "cc-1", organizationId: "org-1" };
const lead = {
  id: "lead-1",
  role: UserRole.IT_SUPPORT,
  clientCompanyId: "cc-1",
  organizationId: "org-1",
  isSupportLead: true,
};
const admin = { id: "admin-1", role: UserRole.ADMIN, organizationId: "org-1" };

const loggedItem = {
  id: "fb-1",
  ticketNumber: 42,
  createdAt: new Date("2024-01-15T00:00:00.000Z"),
  projectId: "proj-1",
  clientCompanyId: "cc-1",
  supportStatus: SupportStatus.LOGGED,
  status: FeedbackStatus.LOGGED,
  type: "bug",
  title: "Broken export",
  submitterName: "End User",
  submitterEmail: "user@client.co",
  // Assigned to the default `supporter` actor — most tests below exercise
  // state-transition logic, not the assignment gate (see its own describe
  // block further down), so the default actor needs to already own the item.
  assignedSupporterId: "sup-1",
  deletedAt: null,
};

const investigatingItem = { ...loggedItem, supportStatus: SupportStatus.INVESTIGATING };

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe("FeedbackSupportService", () => {
  let feedbackRepo: any;
  let historyRepo: any;
  let supportHistoryRepo: any;
  let companyRepo: any;
  let projectRepo: any;
  let memberRepo: any;
  let authRepo: any;
  let userRepo: any;
  let notificationService: any;
  let service: FeedbackSupportService;

  beforeEach(() => {
    feedbackRepo = makeFeedbackRepo();
    historyRepo = makeHistoryRepo();
    supportHistoryRepo = makeSupportHistoryRepo();
    companyRepo = makeCompanyRepo();
    projectRepo = makeProjectRepo();
    memberRepo = makeMemberRepo();
    authRepo = makeAuthRepo();
    userRepo = makeUserRepo();
    notificationService = makeNotificationService();
    service = new FeedbackSupportService(
      feedbackRepo,
      historyRepo,
      companyRepo,
      projectRepo,
      memberRepo,
      authRepo,
      userRepo,
      notificationService,
      supportHistoryRepo
    );
  });

  describe("fetchQueue", () => {
    it("rejects non-supporter roles", async () => {
      await expect(service.fetchQueue(admin, {})).rejects.toMatchObject({ statusCode: 403 });
    });

    it("scopes the queue to the supporter's own company", async () => {
      await service.fetchQueue(supporter, { page: 2, supportStatus: "logged" });
      expect(feedbackRepo.fetchPaginated).toHaveBeenCalledWith(
        expect.objectContaining({ clientCompanyId: "cc-1", page: 2, supportStatus: "logged" })
      );
    });
  });

  describe("updateStatus", () => {
    it("advances one working stage and records + emails it", async () => {
      feedbackRepo.findById.mockResolvedValue(loggedItem);
      feedbackRepo.update.mockResolvedValue({
        ...loggedItem,
        supportStatus: SupportStatus.ACKNOWLEDGED,
      });

      await service.updateStatus(supporter, "fb-1", SupportStatus.ACKNOWLEDGED);

      expect(feedbackRepo.update).toHaveBeenCalledWith("fb-1", {
        supportStatus: SupportStatus.ACKNOWLEDGED,
      });
      expect(supportHistoryRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ feedbackId: "fb-1", status: SupportStatus.ACKNOWLEDGED })
      );
      const { sendSupportStatusEmail } = require("../../../shared/utils/mail/support.mail");
      expect(sendSupportStatusEmail).toHaveBeenCalledWith(
        "user@client.co",
        "End User",
        "Client Co",
        "Product A",
        "TKT-20240115-042 — Broken export",
        expect.any(String),
        expect.any(String),
        null,
        "org-1"
      );
    });

    it("includes an optional note in the stage email and stores it as the latest note", async () => {
      feedbackRepo.findById.mockResolvedValue(loggedItem);
      feedbackRepo.update.mockResolvedValue({
        ...loggedItem,
        supportStatus: SupportStatus.ACKNOWLEDGED,
        supportResponse: "Looking into it now.",
      });

      await service.updateStatus(supporter, "fb-1", SupportStatus.ACKNOWLEDGED, "Looking into it now.");

      expect(feedbackRepo.update).toHaveBeenCalledWith("fb-1", {
        supportStatus: SupportStatus.ACKNOWLEDGED,
        supportResponse: "Looking into it now.",
      });
      const { sendSupportStatusEmail } = require("../../../shared/utils/mail/support.mail");
      expect(sendSupportStatusEmail).toHaveBeenCalledWith(
        "user@client.co",
        "End User",
        "Client Co",
        "Product A",
        "TKT-20240115-042 — Broken export",
        expect.any(String),
        expect.any(String),
        "Looking into it now.",
        "org-1"
      );
    });

    it("ignores a blank/whitespace-only note", async () => {
      feedbackRepo.findById.mockResolvedValue(loggedItem);
      feedbackRepo.update.mockResolvedValue({
        ...loggedItem,
        supportStatus: SupportStatus.ACKNOWLEDGED,
      });

      await service.updateStatus(supporter, "fb-1", SupportStatus.ACKNOWLEDGED, "   ");

      expect(feedbackRepo.update).toHaveBeenCalledWith("fb-1", {
        supportStatus: SupportStatus.ACKNOWLEDGED,
      });
    });

    it("422s on a skipped stage (logged → investigating)", async () => {
      feedbackRepo.findById.mockResolvedValue(loggedItem);
      await expect(
        service.updateStatus(supporter, "fb-1", SupportStatus.INVESTIGATING)
      ).rejects.toMatchObject({ statusCode: 422 });
      expect(feedbackRepo.update).not.toHaveBeenCalled();
    });

    it("422s when asked to set a terminal stage directly", async () => {
      feedbackRepo.findById.mockResolvedValue(investigatingItem);
      await expect(
        service.updateStatus(supporter, "fb-1", SupportStatus.RESOLVED)
      ).rejects.toMatchObject({ statusCode: 422 });
    });
  });

  // Peers shouldn't be able to touch each other's assigned tickets — only the
  // assigned supporter, or any lead (who can also just reassign it). Exercised
  // via updateStatus as a stand-in; getAssignedItem gates every mutating action.
  describe("assignment gate", () => {
    it("403s a non-lead supporter on an unassigned item", async () => {
      feedbackRepo.findById.mockResolvedValue({ ...loggedItem, assignedSupporterId: null });
      await expect(
        service.updateStatus(supporter, "fb-1", SupportStatus.ACKNOWLEDGED)
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(feedbackRepo.update).not.toHaveBeenCalled();
    });

    it("403s a non-lead supporter on a peer's assigned item", async () => {
      feedbackRepo.findById.mockResolvedValue({ ...loggedItem, assignedSupporterId: "sup-2" });
      await expect(
        service.updateStatus(supporter, "fb-1", SupportStatus.ACKNOWLEDGED)
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it("allows the assigned supporter", async () => {
      feedbackRepo.findById.mockResolvedValue({ ...loggedItem, assignedSupporterId: "sup-1" });
      feedbackRepo.update.mockResolvedValue({
        ...loggedItem,
        assignedSupporterId: "sup-1",
        supportStatus: SupportStatus.ACKNOWLEDGED,
      });
      await service.updateStatus(supporter, "fb-1", SupportStatus.ACKNOWLEDGED);
      expect(feedbackRepo.update).toHaveBeenCalled();
    });

    it("lets a lead act on a peer's assigned item, regardless of assignment", async () => {
      feedbackRepo.findById.mockResolvedValue({
        ...loggedItem,
        supportStatus: SupportStatus.ACKNOWLEDGED,
        assignedSupporterId: "sup-2",
      });
      feedbackRepo.update.mockResolvedValue({
        ...loggedItem,
        supportStatus: SupportStatus.INVESTIGATING,
        assignedSupporterId: "sup-2",
      });
      await service.updateStatus(lead, "fb-1", SupportStatus.INVESTIGATING);
      expect(feedbackRepo.update).toHaveBeenCalled();
    });
  });

  // Nobody's on the hook for an item until someone is assigned to it — a lead
  // can reach an unassigned item (the peer-ownership gate above doesn't stop
  // them), but the workflow itself still refuses to move it past "logged".
  describe("acknowledgment requires assignment", () => {
    it("422s a lead moving an unassigned item to acknowledged", async () => {
      feedbackRepo.findById.mockResolvedValue({ ...loggedItem, assignedSupporterId: null });
      await expect(
        service.updateStatus(lead, "fb-1", SupportStatus.ACKNOWLEDGED)
      ).rejects.toMatchObject({ statusCode: 422 });
      expect(feedbackRepo.update).not.toHaveBeenCalled();
    });

    it("allows acknowledging once the item is assigned", async () => {
      feedbackRepo.findById.mockResolvedValue({ ...loggedItem, assignedSupporterId: "sup-1" });
      feedbackRepo.update.mockResolvedValue({
        ...loggedItem,
        assignedSupporterId: "sup-1",
        supportStatus: SupportStatus.ACKNOWLEDGED,
      });
      await service.updateStatus(lead, "fb-1", SupportStatus.ACKNOWLEDGED);
      expect(feedbackRepo.update).toHaveBeenCalled();
    });
  });

  describe("resolveLocally", () => {
    it("404s on another company's item", async () => {
      feedbackRepo.findById.mockResolvedValue({ ...investigatingItem, clientCompanyId: "cc-other" });
      await expect(service.resolveLocally(supporter, "fb-1", "note")).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it("409s on an already-terminal item", async () => {
      feedbackRepo.findById.mockResolvedValue({
        ...loggedItem,
        supportStatus: SupportStatus.ESCALATED,
      });
      await expect(service.resolveLocally(supporter, "fb-1", "note")).rejects.toMatchObject({
        statusCode: 409,
      });
    });

    it("422s before the item reaches investigating", async () => {
      feedbackRepo.findById.mockResolvedValue(loggedItem);
      await expect(service.resolveLocally(supporter, "fb-1", "note")).rejects.toMatchObject({
        statusCode: 422,
      });
    });

    it("resolves an investigating item directly, with the note and no confirm link", async () => {
      feedbackRepo.findById.mockResolvedValue(investigatingItem);
      feedbackRepo.update.mockResolvedValue({
        ...investigatingItem,
        supportStatus: SupportStatus.RESOLVED,
      });

      await service.resolveLocally(supporter, "fb-1", "Restart the app");

      expect(feedbackRepo.update).toHaveBeenCalledWith("fb-1", {
        supportStatus: SupportStatus.RESOLVED,
        supportResponse: "Restart the app",
        supportResolvedAt: expect.any(Date),
      });
      expect(supportHistoryRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ feedbackId: "fb-1", status: SupportStatus.RESOLVED })
      );
      // Local resolutions never create product-team history rows.
      expect(historyRepo.create).not.toHaveBeenCalled();

      const { sendSupportResolutionEmail } = require("../../../shared/utils/mail/support.mail");
      expect(sendSupportResolutionEmail).toHaveBeenCalledWith(
        "user@client.co",
        "End User",
        "Client Co",
        "Product A",
        "TKT-20240115-042 — Broken export",
        "Restart the app",
        null,
        "org-1"
      );
    });

    it("409s if already resolved", async () => {
      feedbackRepo.findById.mockResolvedValue({
        ...investigatingItem,
        supportStatus: SupportStatus.RESOLVED,
      });
      await expect(service.resolveLocally(supporter, "fb-1", "note")).rejects.toMatchObject({
        statusCode: 409,
      });
    });
  });

  describe("escalate", () => {
    it("409s when already escalated", async () => {
      feedbackRepo.findById.mockResolvedValue({
        ...loggedItem,
        supportStatus: SupportStatus.ESCALATED,
      });
      await expect(service.escalate(supporter, "fb-1", "high")).rejects.toMatchObject({
        statusCode: 409,
      });
    });

    it("422s before the item reaches investigating", async () => {
      feedbackRepo.findById.mockResolvedValue(loggedItem);
      await expect(service.escalate(supporter, "fb-1", "high")).rejects.toMatchObject({
        statusCode: 422,
      });
    });

    it("escalates an investigating item and starts the product-team timeline", async () => {
      feedbackRepo.findById.mockResolvedValue(investigatingItem);
      feedbackRepo.update.mockResolvedValue({
        ...investigatingItem,
        supportStatus: SupportStatus.ESCALATED,
      });

      await service.escalate(supporter, "fb-1", "critical", "Beyond our access");

      expect(feedbackRepo.update).toHaveBeenCalledWith(
        "fb-1",
        expect.objectContaining({
          supportStatus: SupportStatus.ESCALATED,
          supportResponse: "Beyond our access",
          escalatedAt: expect.any(Date),
          escalatedById: "sup-1",
          severity: "critical",
        })
      );
      // The "logged" history row is created at escalation, not submission —
      // IT-queue dwell time never counts against the product team.
      expect(historyRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          feedbackId: "fb-1",
          status: FeedbackStatus.LOGGED,
        })
      );
      // The IT-tier timeline records the escalation too.
      expect(supportHistoryRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ feedbackId: "fb-1", status: SupportStatus.ESCALATED })
      );
    });

    it("notifies the product org's deduped recipients", async () => {
      const orgAdmin = { id: "admin-1", email: "a@org.com", firstName: "Ada" };
      feedbackRepo.findById.mockResolvedValue(investigatingItem);
      feedbackRepo.update.mockResolvedValue({
        ...investigatingItem,
        supportStatus: SupportStatus.ESCALATED,
      });
      authRepo.findByRoleAndOrg.mockResolvedValue([orgAdmin]);
      memberRepo.findMemberUsers.mockResolvedValue([orgAdmin]); // duplicate — must dedupe

      await service.escalate(supporter, "fb-1", "medium");
      await flush(); // fan-out is fire-and-forget

      expect(notificationService.notifyFeedbackEscalated).toHaveBeenCalledTimes(1);
      const [recipients, ctx] = notificationService.notifyFeedbackEscalated.mock.calls[0];
      expect(recipients).toHaveLength(1);
      expect(ctx).toMatchObject({
        feedbackId: "fb-1",
        companyName: "Client Co",
        escalatedByName: "Sam Support",
        severity: "medium",
      });
    });
  });

  describe("notifySubmitterFixed", () => {
    const escalatedClosedItem = {
      ...loggedItem,
      supportStatus: SupportStatus.ESCALATED,
      status: FeedbackStatus.CLOSED,
      submitterNotifiedAt: null,
    };

    it("422s when the item was never escalated", async () => {
      feedbackRepo.findById.mockResolvedValue({
        ...loggedItem,
        status: FeedbackStatus.CLOSED,
      });
      await expect(
        service.notifySubmitterFixed(supporter, "fb-1", "Fixed!")
      ).rejects.toMatchObject({ statusCode: 422 });
    });

    it("422s while the product team hasn't closed it yet", async () => {
      feedbackRepo.findById.mockResolvedValue({
        ...loggedItem,
        supportStatus: SupportStatus.ESCALATED,
        status: FeedbackStatus.INVESTIGATING,
      });
      await expect(
        service.notifySubmitterFixed(supporter, "fb-1", "Fixed!")
      ).rejects.toMatchObject({ statusCode: 422 });
    });

    it("409s if the submitter was already notified", async () => {
      feedbackRepo.findById.mockResolvedValue({
        ...escalatedClosedItem,
        submitterNotifiedAt: new Date(),
      });
      await expect(
        service.notifySubmitterFixed(supporter, "fb-1", "Fixed!")
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it("emails the submitter and records the notified timestamp", async () => {
      feedbackRepo.findById.mockResolvedValue(escalatedClosedItem);
      feedbackRepo.update.mockResolvedValue({
        ...escalatedClosedItem,
        submitterNotifiedAt: new Date(),
      });

      await service.notifySubmitterFixed(supporter, "fb-1", "All fixed now!");

      expect(feedbackRepo.update).toHaveBeenCalledWith(
        "fb-1",
        expect.objectContaining({ submitterNotifiedAt: expect.any(Date) })
      );
      const { sendSupportResolutionEmail } = require("../../../shared/utils/mail/support.mail");
      expect(sendSupportResolutionEmail).toHaveBeenCalledWith(
        "user@client.co",
        "End User",
        "Client Co",
        "Product A",
        "TKT-20240115-042 — Broken export",
        "All fixed now!",
        null,
        "org-1"
      );
    });
  });

  describe("listTeammates", () => {
    it("403s for a non-lead supporter", async () => {
      await expect(service.listTeammates(supporter)).rejects.toMatchObject({ statusCode: 403 });
      expect(userRepo.findByClientCompany).not.toHaveBeenCalled();
    });

    it("returns the company's supporters for a lead", async () => {
      userRepo.findByClientCompany.mockResolvedValue([{ id: "sup-2" }]);
      const rows = await service.listTeammates(lead);
      expect(userRepo.findByClientCompany).toHaveBeenCalledWith("cc-1");
      expect(rows).toEqual([{ id: "sup-2" }]);
    });
  });

  describe("assignToSupporter", () => {
    it("403s for a non-lead supporter", async () => {
      await expect(service.assignToSupporter(supporter, "fb-1", "sup-2")).rejects.toMatchObject({
        statusCode: 403,
      });
      expect(feedbackRepo.findById).not.toHaveBeenCalled();
    });

    it("404s when the target isn't a supporter of the same company", async () => {
      feedbackRepo.findById.mockResolvedValue(loggedItem);
      userRepo.findById.mockResolvedValue({
        id: "sup-2",
        role: UserRole.IT_SUPPORT,
        clientCompanyId: "cc-other",
        deletedAt: null,
      });
      await expect(service.assignToSupporter(lead, "fb-1", "sup-2")).rejects.toMatchObject({
        statusCode: 404,
      });
      expect(feedbackRepo.update).not.toHaveBeenCalled();
    });

    it("assigns the item and notifies the supporter", async () => {
      feedbackRepo.findById.mockResolvedValue(loggedItem);
      userRepo.findById.mockResolvedValue({
        id: "sup-2",
        firstName: "Sue",
        lastName: "Support",
        email: "sue@client.co",
        role: UserRole.IT_SUPPORT,
        clientCompanyId: "cc-1",
        deletedAt: null,
      });
      feedbackRepo.update.mockResolvedValue({ ...loggedItem, assignedSupporterId: "sup-2" });

      await service.assignToSupporter(lead, "fb-1", "sup-2");
      await flush(); // notify is fire-and-forget

      expect(feedbackRepo.update).toHaveBeenCalledWith("fb-1", { assignedSupporterId: "sup-2" });
      expect(notificationService.notifySupportItemAssigned).toHaveBeenCalledWith(
        expect.objectContaining({ id: "sup-2" }),
        expect.objectContaining({ feedbackId: "fb-1", companyName: "Client Co" })
      );
    });

    it("unassigns when supporterId is null, without notifying anyone", async () => {
      feedbackRepo.findById.mockResolvedValue({ ...loggedItem, assignedSupporterId: "sup-2" });
      feedbackRepo.update.mockResolvedValue({ ...loggedItem, assignedSupporterId: null });

      await service.assignToSupporter(lead, "fb-1", null);

      expect(feedbackRepo.update).toHaveBeenCalledWith("fb-1", { assignedSupporterId: null });
      expect(userRepo.findById).not.toHaveBeenCalled();
      expect(notificationService.notifySupportItemAssigned).not.toHaveBeenCalled();
    });
  });

  describe("notifyQueueItem", () => {
    it("alerts the company's supporters", async () => {
      const sup = { id: "sup-2", email: "s@client.co", firstName: "Sue" };
      userRepo.findByClientCompany.mockResolvedValue([sup]);

      await service.notifyQueueItem(
        { id: "cc-1", name: "Client Co" },
        loggedItem as any,
        { id: "proj-1", name: "Product A", organizationId: "org-1" }
      );

      expect(notificationService.notifySupportQueueItem).toHaveBeenCalledWith(
        [sup],
        expect.objectContaining({ feedbackId: "fb-1", companyName: "Client Co" })
      );
    });

    it("does nothing when the company has no supporters", async () => {
      await service.notifyQueueItem(
        { id: "cc-1", name: "Client Co" },
        loggedItem as any,
        { id: "proj-1", name: "Product A" }
      );
      expect(notificationService.notifySupportQueueItem).not.toHaveBeenCalled();
    });

    it("auto-assigns to the least-busy supporter when the company has it enabled", async () => {
      const busy = { id: "sup-2", email: "busy@client.co", firstName: "Busy" };
      const idle = { id: "sup-3", email: "idle@client.co", firstName: "Idle" };
      userRepo.findByClientCompany.mockResolvedValue([busy, idle]);
      feedbackRepo.countOpenBySupporter.mockResolvedValue({ "sup-2": 3 });

      await service.notifyQueueItem(
        { id: "cc-1", name: "Client Co", autoAssignEnabled: true },
        loggedItem as any,
        { id: "proj-1", name: "Product A", organizationId: "org-1" }
      );

      expect(feedbackRepo.update).toHaveBeenCalledWith("fb-1", { assignedSupporterId: "sup-3" });
      expect(notificationService.notifySupportItemAssigned).toHaveBeenCalledWith(
        idle,
        expect.objectContaining({ feedbackId: "fb-1", assignedByName: "Auto-assignment" })
      );
      expect(notificationService.notifySupportQueueItem).not.toHaveBeenCalled();
    });

    it("falls back to alerting the whole queue when auto-assign is off", async () => {
      const sup = { id: "sup-2", email: "s@client.co", firstName: "Sue" };
      userRepo.findByClientCompany.mockResolvedValue([sup]);

      await service.notifyQueueItem(
        { id: "cc-1", name: "Client Co", autoAssignEnabled: false },
        loggedItem as any,
        { id: "proj-1", name: "Product A", organizationId: "org-1" }
      );

      expect(feedbackRepo.update).not.toHaveBeenCalled();
      expect(notificationService.notifySupportItemAssigned).not.toHaveBeenCalled();
      expect(notificationService.notifySupportQueueItem).toHaveBeenCalled();
    });
  });
});
