// modules/supportChat/tests/supportChat.service.spec.js
const { SupportChatService } = require("../services/supportChat.service");
const { actorFor } = require("../../../test/actors");

function makeConvRepo() {
  return {
    findById: jest.fn(),
    findOpenByUser: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    fetchPaginated: jest.fn(),
    totalAdminUnread: jest.fn(),
  };
}

function makeMessageRepo() {
  return {
    fetchPaginated: jest.fn(),
    create: jest.fn().mockImplementation(async (d) => ({ id: "msg-1", ...d })),
  };
}

function makeAuthRepo() {
  return {
    findByRole: jest.fn().mockResolvedValue([]),
    findUserById: jest.fn().mockResolvedValue({ id: "user-1", firstName: "Ada", lastName: "Lovelace" }),
  };
}

function makeNotificationService() {
  return {
    notifyNewSupportChatMessage: jest.fn(),
    notifySupportChatReply: jest.fn(),
  };
}

function makeSettingsRepo() {
  return {
    getOrCreate: jest.fn().mockResolvedValue({ enabled: true }),
    setEnabled: jest.fn().mockImplementation(async (enabled) => ({ enabled })),
  };
}

function makeStorage() {
  return {
    uploadImage: jest.fn().mockResolvedValue({
      url: "https://cdn/img.png",
      publicId: "testmate/support-chat/img",
      bytes: 1234,
    }),
  };
}

const user = actorFor("user", { id: "user-1" });
const superadmin = actorFor("superadmin", { id: "sa-1" });
const conversation = {
  id: "conv-1",
  userId: "user-1",
  status: "open",
  userUnread: 0,
  adminUnread: 0,
};

// Let fire-and-forget notification promises settle before assertions.
const flush = () => new Promise((r) => setImmediate(r));

describe("SupportChatService", () => {
  let convRepo, messageRepo, authRepo, notificationService, settingsRepo, storage, service;

  beforeEach(() => {
    convRepo = makeConvRepo();
    messageRepo = makeMessageRepo();
    authRepo = makeAuthRepo();
    notificationService = makeNotificationService();
    settingsRepo = makeSettingsRepo();
    storage = makeStorage();
    service = new SupportChatService(
      convRepo,
      messageRepo,
      authRepo,
      notificationService,
      settingsRepo,
      storage
    );
  });

  describe("getMyConversation", () => {
    it("returns the existing open conversation without creating one", async () => {
      convRepo.findOpenByUser.mockResolvedValue(conversation);
      const result = await service.getMyConversation(user);
      expect(result).toBe(conversation);
      expect(convRepo.create).not.toHaveBeenCalled();
    });
  });

  describe("sendUserMessage", () => {
    it("creates a conversation lazily, stores the message and bumps admin unread", async () => {
      convRepo.findOpenByUser.mockResolvedValue(null);
      convRepo.create.mockResolvedValue({ id: "conv-1" });
      convRepo.findById.mockResolvedValue({ ...conversation, adminUnread: 0 });

      const msg = await service.sendUserMessage(user, "Help me please");

      expect(convRepo.create).toHaveBeenCalledWith({ userId: "user-1", status: "open" });
      expect(messageRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: "conv-1", authorRole: "user", body: "Help me please" })
      );
      expect(convRepo.update).toHaveBeenCalledWith(
        "conv-1",
        expect.objectContaining({ lastSenderRole: "user", adminUnread: 1 })
      );
      expect(msg.body).toBe("Help me please");
    });

    it("notifies every super admin", async () => {
      convRepo.findOpenByUser.mockResolvedValue(conversation);
      authRepo.findByRole.mockResolvedValue([superadmin]);

      await service.sendUserMessage(user, "hi");
      await flush();

      expect(authRepo.findByRole).toHaveBeenCalledWith("superadmin");
      expect(notificationService.notifyNewSupportChatMessage).toHaveBeenCalledWith(
        [superadmin],
        expect.objectContaining({ conversationId: "conv-1" })
      );
    });
  });

  describe("attachments", () => {
    it("uploads image files and denormalizes them onto the message", async () => {
      convRepo.findOpenByUser.mockResolvedValue(conversation);
      const files = [{ buffer: Buffer.from("x"), originalname: "shot.png", mimetype: "image/png", size: 10 }];

      await service.sendUserMessage(user, "", files);

      expect(storage.uploadImage).toHaveBeenCalledTimes(1);
      expect(messageRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          body: "",
          attachments: [
            expect.objectContaining({ url: "https://cdn/img.png", name: "shot.png", mimeType: "image/png" }),
          ],
        })
      );
      // Image-only message still updates the preview.
      expect(convRepo.update).toHaveBeenCalledWith(
        "conv-1",
        expect.objectContaining({ lastMessagePreview: "📎 1 attachment" })
      );
    });

    it("rejects a message with neither text nor attachments", async () => {
      convRepo.findOpenByUser.mockResolvedValue(conversation);
      await expect(service.sendUserMessage(user, "   ", [])).rejects.toMatchObject({ statusCode: 400 });
      expect(messageRepo.create).not.toHaveBeenCalled();
    });
  });

  describe("markReadByUser", () => {
    it("zeroes the user's unread counter on their open conversation", async () => {
      convRepo.findOpenByUser.mockResolvedValue({ ...conversation, userUnread: 4 });
      await service.markReadByUser(user);
      expect(convRepo.update).toHaveBeenCalledWith("conv-1", { userUnread: 0 });
    });

    it("is a no-op when the user has no open conversation", async () => {
      convRepo.findOpenByUser.mockResolvedValue(null);
      await service.markReadByUser(user);
      expect(convRepo.update).not.toHaveBeenCalled();
    });
  });

  describe("admin authorization", () => {
    it("rejects non-super-admins from the inbox", async () => {
      await expect(service.listConversations(user, {})).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe("sendAdminMessage", () => {
    it("reopens the thread, bumps user unread, clears admin unread and notifies the user", async () => {
      convRepo.findById.mockResolvedValue({ ...conversation, status: "closed", userUnread: 1, adminUnread: 3 });

      await service.sendAdminMessage(superadmin, "conv-1", "On it!");
      await flush();

      expect(messageRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ authorRole: "admin", body: "On it!" })
      );
      expect(convRepo.update).toHaveBeenCalledWith(
        "conv-1",
        expect.objectContaining({ status: "open", userUnread: 2, adminUnread: 0, lastSenderRole: "admin" })
      );
      expect(notificationService.notifySupportChatReply).toHaveBeenCalledWith(
        expect.objectContaining({ id: "user-1" }),
        expect.objectContaining({ conversationId: "conv-1" })
      );
    });

    it("404s for a missing conversation", async () => {
      convRepo.findById.mockResolvedValue(null);
      await expect(service.sendAdminMessage(superadmin, "nope", "x")).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  describe("toggle (enable/disable)", () => {
    it("blocks user messages when the chat is disabled", async () => {
      settingsRepo.getOrCreate.mockResolvedValue({ enabled: false });
      await expect(service.sendUserMessage(user, "hi")).rejects.toMatchObject({ statusCode: 403 });
      expect(messageRepo.create).not.toHaveBeenCalled();
    });

    it("keeps the toggle behind settings.manage, not the inbox permissions", async () => {
      await expect(service.setEnabled(user, false)).rejects.toMatchObject({ statusCode: 403 });
      const result = await service.setEnabled(superadmin, false);
      expect(settingsRepo.setEnabled).toHaveBeenCalledWith(false, "sa-1");
      expect(result).toEqual({ enabled: false });
    });
  });

  describe("setStatus", () => {
    it("updates the conversation status", async () => {
      convRepo.findById.mockResolvedValue(conversation);
      convRepo.update.mockResolvedValue({ ...conversation, status: "closed" });
      const result = await service.setStatus(superadmin, "conv-1", "closed");
      expect(convRepo.update).toHaveBeenCalledWith("conv-1", { status: "closed" });
      expect(result.status).toBe("closed");
    });
  });
});
