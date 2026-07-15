// modules/supportChat/services/supportChat.service.js
// In-app support chat: internal users raise issues via a floating widget; the
// platform's super admins answer from a dedicated inbox. Conversation state is
// in Postgres; messages are in Firestore (realtime). Notifications and the
// last-message denormalization are fire-and-forget, same as the rest of the app.
const {
  SupportChatConversationRepository,
} = require("../repositories/supportChatConversation.repository");
const {
  SupportChatMessageRepository,
} = require("../repositories/supportChatMessage.repository");
const {
  SupportChatSettingsRepository,
} = require("../repositories/supportChatSettings.repository");
const { AuthRepository } = require("../../auth/repositories/auth.repository");
const { NotificationService } = require("../../notification/services/notification.service");
const { StorageService } = require("../../../shared/services/storage.service");
const { AppError } = require("../../../shared/errors/AppError");
const { UserRole, SupportChatStatus } = require("../../../config/constants");

const CLOUDINARY_FOLDER = "testmate/support-chat";
const MAX_ATTACHMENTS_PER_MESSAGE = 5;

function displayName(user) {
  if (!user) return "A user";
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "A user";
}

function preview(body, attachmentCount = 0) {
  const trimmed = (body || "").trim().replace(/\s+/g, " ");
  if (!trimmed && attachmentCount > 0) {
    return `📎 ${attachmentCount} attachment${attachmentCount > 1 ? "s" : ""}`;
  }
  return trimmed.length > 280 ? `${trimmed.slice(0, 277)}...` : trimmed;
}

class SupportChatService {
  static Instance = new SupportChatService();

  constructor(
    convRepo = SupportChatConversationRepository.Instance,
    messageRepo = SupportChatMessageRepository.Instance,
    authRepo = AuthRepository.Instance,
    notificationService = NotificationService.Instance,
    settingsRepo = SupportChatSettingsRepository.Instance,
    storage = StorageService.Instance
  ) {
    this.convRepo = convRepo;
    this.messageRepo = messageRepo;
    this.authRepo = authRepo;
    this.notificationService = notificationService;
    this.settingsRepo = settingsRepo;
    this.storage = storage;
  }

  // Uploads multer memory files to Cloudinary and returns attachment metadata to
  // denormalize onto the Firestore message. Images only (same as every other
  // attachment in the app).
  async uploadAttachments(files) {
    if (!files || files.length === 0) return [];
    if (files.length > MAX_ATTACHMENTS_PER_MESSAGE) {
      throw new AppError(`At most ${MAX_ATTACHMENTS_PER_MESSAGE} files per message`, 422);
    }
    const attachments = [];
    for (const file of files) {
      const result = await this.storage.uploadImage(file.buffer, { folder: CLOUDINARY_FOLDER });
      attachments.push({
        url: result.url,
        publicId: result.publicId,
        name: file.originalname,
        mimeType: file.mimetype,
        bytes: result.bytes ?? file.size ?? null,
      });
    }
    return attachments;
  }

  // ── Global on/off toggle (super-admin controlled) ────────────────────────────

  async getSettings() {
    const settings = await this.settingsRepo.getOrCreate();
    return { enabled: settings.enabled };
  }

  async setEnabled(actor, enabled) {
    this.assertAdmin(actor);
    const settings = await this.settingsRepo.setEnabled(enabled, actor.id);
    return { enabled: settings.enabled };
  }

  // The floater is disabled platform-wide — block new user messages too, so the
  // toggle can't be bypassed by hitting the API directly.
  async assertEnabled() {
    const { enabled } = await this.getSettings();
    if (!enabled) throw new AppError("Support chat is currently disabled", 403);
  }

  // ── User side (the floating widget) ────────────────────────────────────────

  // The floater reads this on mount — returns null (rather than creating a row)
  // for the many users who never actually chat. The conversation is created
  // lazily on the first message instead (getOrCreateMyConversation).
  getMyConversation(actor) {
    return this.convRepo.findOpenByUser(actor.id);
  }

  // The floater binds to a single open conversation, created lazily on first send.
  async getOrCreateMyConversation(actor) {
    const existing = await this.convRepo.findOpenByUser(actor.id);
    if (existing) return existing;
    const created = await this.convRepo.create({
      userId: actor.id,
      status: SupportChatStatus.OPEN,
    });
    // create() doesn't join the user relation — reload so the DTO has it.
    return this.convRepo.findById(created.id);
  }

  async sendUserMessage(actor, body, files) {
    await this.assertEnabled();
    const text = (body || "").trim();
    const attachments = await this.uploadAttachments(files);
    if (!text && attachments.length === 0) {
      throw new AppError("A message or an attachment is required", 400);
    }
    const conversation = await this.getOrCreateMyConversation(actor);
    const sender = await this.authRepo.findUserById(actor.id);
    const authorName = displayName(sender);

    const message = await this.messageRepo.create({
      conversationId: conversation.id,
      authorId: actor.id,
      authorName,
      authorRole: "user",
      body: text,
      attachments,
    });

    const previewText = preview(text, attachments.length);

    // Firestore write + Postgres denormalization aren't one transaction (different
    // stores) — accepted eventual-consistency tradeoff, same as feature-request comments.
    await this.convRepo.update(conversation.id, {
      lastMessageAt: new Date(),
      lastMessagePreview: previewText,
      lastSenderRole: "user",
      adminUnread: (conversation.adminUnread ?? 0) + 1,
    });

    this.authRepo
      .findByRole(UserRole.SUPERADMIN)
      .then((admins) => {
        if (admins.length) {
          this.notificationService.notifyNewSupportChatMessage(admins, {
            conversationId: conversation.id,
            senderName: authorName,
            preview: previewText,
          });
        }
      })
      .catch((e) => console.error("[supportChat] new-message notify failed:", e.message));

    return message;
  }

  async markReadByUser(actor) {
    const conversation = await this.convRepo.findOpenByUser(actor.id);
    if (!conversation) return;
    await this.convRepo.update(conversation.id, { userUnread: 0 });
  }

  // ── Super-admin side (the inbox) ───────────────────────────────────────────

  assertAdmin(actor) {
    if (actor.role !== UserRole.SUPERADMIN) {
      throw new AppError("Only super admins can manage support chats", 403);
    }
  }

  async listConversations(actor, params) {
    this.assertAdmin(actor);
    return this.convRepo.fetchPaginated(params);
  }

  async getConversation(actor, id) {
    this.assertAdmin(actor);
    const conversation = await this.convRepo.findById(id);
    if (!conversation) throw new AppError("Conversation not found", 404);
    return conversation;
  }

  async fetchMessages(actor, id, params) {
    await this.getConversation(actor, id);
    return this.messageRepo.fetchPaginated(id, params);
  }

  async sendAdminMessage(actor, id, body, files) {
    const conversation = await this.getConversation(actor, id);
    const text = (body || "").trim();
    const attachments = await this.uploadAttachments(files);
    if (!text && attachments.length === 0) {
      throw new AppError("A message or an attachment is required", 400);
    }
    const sender = await this.authRepo.findUserById(actor.id);
    const authorName = displayName(sender);

    const message = await this.messageRepo.create({
      conversationId: conversation.id,
      authorId: actor.id,
      authorName,
      authorRole: "admin",
      body: text,
      attachments,
    });

    const previewText = preview(text, attachments.length);

    // Answering a closed thread reopens it so the user's reply lands somewhere.
    await this.convRepo.update(conversation.id, {
      status: SupportChatStatus.OPEN,
      lastMessageAt: new Date(),
      lastMessagePreview: previewText,
      lastSenderRole: "admin",
      userUnread: (conversation.userUnread ?? 0) + 1,
      adminUnread: 0,
    });

    this.authRepo
      .findUserById(conversation.userId)
      .then((user) => {
        if (user) {
          this.notificationService.notifySupportChatReply(user, {
            conversationId: conversation.id,
            preview: previewText,
          });
        }
      })
      .catch((e) => console.error("[supportChat] reply notify failed:", e.message));

    return message;
  }

  async markReadByAdmin(actor, id) {
    const conversation = await this.getConversation(actor, id);
    await this.convRepo.update(conversation.id, { adminUnread: 0 });
  }

  async setStatus(actor, id, status) {
    const conversation = await this.getConversation(actor, id);
    return this.convRepo.update(conversation.id, { status });
  }
}

module.exports = { SupportChatService };
