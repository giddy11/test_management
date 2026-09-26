// modules/liveChat/services/liveChat.service.ts
// Embeddable live-chat widget: an anonymous website visitor raises a
// conversation via a project's public widget token; the project's staff
// answer from the operator inbox. Same split as support-chat: conversation
// state is in Postgres, messages are in Firestore (realtime). Notifications
// and the last-message denormalization are fire-and-forget, same as the rest
// of the app.
import { randomUUID } from "crypto";
import { LiveChatVisitorRepository } from "../repositories/liveChatVisitor.repository";
import {
  LiveChatConversationRepository,
  type FetchConversationsParams,
} from "../repositories/liveChatConversation.repository";
import {
  LiveChatMessageRepository,
  type LiveChatMessageAttachment,
} from "../repositories/liveChatMessage.repository";
import { LiveChatSettingsRepository } from "../repositories/liveChatSettings.repository";
import { LiveChatAccountRepository } from "../repositories/liveChatAccount.repository";
import { ProjectRepository } from "../../project/repositories/project.repository";
import { ProjectService } from "../../project/services/project.service";
import { ProjectMemberRepository } from "../../project/repositories/projectMember.repository";
import type { LiveChatVisitor } from "../entities/liveChatVisitor.entity";
import type { LiveChatConversation } from "../entities/liveChatConversation.entity";
import type { LiveChatSettings } from "../entities/liveChatSettings.entity";
import type { Project } from "../../project/entities/project.entity";
import type { Actor } from "../../../shared/types/actor";

const { AuthRepository } = require("../../auth/repositories/auth.repository");
const { hashPassword, comparePassword } = require("../../../shared/utils/password");
const { NotificationService } = require("../../notification/services/notification.service");
const { StorageService } = require("../../../shared/services/storage.service");
const { ALLOWED_IMAGE_TYPES } = require("../../../shared/middleware/upload.middleware");
const { AppError } = require("../../../shared/errors/AppError");
const { UserRole, LiveChatStatus } = require("../../../config/constants");
const { buildMeta } = require("../../../shared/pagination/paginate");

const CLOUDINARY_FOLDER = "testmate/live-chat";
const MAX_ATTACHMENTS_PER_MESSAGE = 5;

type UploadedFile = { buffer: Buffer; originalname: string; mimetype: string; size: number };

function displayName(user: any): string {
  if (!user) return "A staff member";
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "A staff member";
}

function preview(body?: string, attachmentCount = 0): string {
  const trimmed = (body || "").trim().replace(/\s+/g, " ");
  if (!trimmed && attachmentCount > 0) {
    return `📎 ${attachmentCount} attachment${attachmentCount > 1 ? "s" : ""}`;
  }
  return trimmed.length > 280 ? `${trimmed.slice(0, 277)}...` : trimmed;
}

export class LiveChatService {
  static Instance = new LiveChatService();

  visitorRepo: LiveChatVisitorRepository;
  convRepo: LiveChatConversationRepository;
  messageRepo: LiveChatMessageRepository;
  settingsRepo: LiveChatSettingsRepository;
  accountRepo: LiveChatAccountRepository;
  projectRepo: ProjectRepository;
  projectService: ProjectService;
  memberRepo: ProjectMemberRepository;
  authRepo: any;
  notificationService: any;
  storage: any;

  constructor(
    visitorRepo = LiveChatVisitorRepository.Instance,
    convRepo = LiveChatConversationRepository.Instance,
    messageRepo = LiveChatMessageRepository.Instance,
    settingsRepo = LiveChatSettingsRepository.Instance,
    accountRepo = LiveChatAccountRepository.Instance,
    projectRepo = ProjectRepository.Instance,
    projectService = ProjectService.Instance,
    memberRepo = ProjectMemberRepository.Instance,
    authRepo = AuthRepository.Instance,
    notificationService = NotificationService.Instance,
    storage = StorageService.Instance
  ) {
    this.visitorRepo = visitorRepo;
    this.convRepo = convRepo;
    this.messageRepo = messageRepo;
    this.settingsRepo = settingsRepo;
    this.accountRepo = accountRepo;
    this.projectRepo = projectRepo;
    this.projectService = projectService;
    this.memberRepo = memberRepo;
    this.authRepo = authRepo;
    this.notificationService = notificationService;
    this.storage = storage;
  }

  private async uploadAttachments(files?: UploadedFile[]): Promise<LiveChatMessageAttachment[]> {
    if (!files || files.length === 0) return [];
    if (files.length > MAX_ATTACHMENTS_PER_MESSAGE) {
      throw new AppError(`At most ${MAX_ATTACHMENTS_PER_MESSAGE} files per message`, 422);
    }
    const attachments: LiveChatMessageAttachment[] = [];
    for (const file of files) {
      if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
        throw new AppError("Only PNG, JPEG, and WebP images are allowed", 422);
      }
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

  private async resolveProjectByToken(token: string): Promise<Project> {
    const project = await this.projectRepo.findByLiveChatToken(token);
    if (!project || project.deletedAt) throw new AppError("This live chat widget is not available", 404);
    return project;
  }

  // ── Widget bootstrap (public) ───────────────────────────────────────────────

  async getWidgetConfig(token: string) {
    const project = await this.resolveProjectByToken(token);
    const settings = await this.settingsRepo.getOrCreate(project.id);
    return {
      projectId: project.id,
      displayName: settings.displayName || project.name,
      logoUrl: settings.logoUrl,
      greetingMessage: settings.greetingMessage || "Hi! How can we help?",
      offlineMessage:
        settings.offlineMessage || "We're not online right now — leave a message and we'll get back to you.",
      brandColor: settings.brandColor,
      requireAccount: settings.requireAccount,
    };
  }

  // Called on widget mount. visitorId is omitted on a brand-new browser (the
  // server issues one, persisted client-side); sent back on every later call.
  //
  // Account-required projects never auto-create an anonymous visitor, and —
  // just as importantly — never resume a cached visitorId that predates
  // requireAccount being turned on: a browser that visited while the widget
  // was still anonymous has an id with no accountId attached, and that
  // shouldn't be enough to skip the login/signup gate once it's enabled.
  // Only an id that's actually linked to an account (i.e. came from
  // registerAccount/loginAccount) is honored here.
  async startVisitor(
    token: string,
    data: { visitorId?: string; currentUrl?: string; referrer?: string }
  ): Promise<LiveChatVisitor> {
    const project = await this.resolveProjectByToken(token);
    const settings = await this.settingsRepo.getOrCreate(project.id);

    if (data.visitorId) {
      const existing = await this.visitorRepo.findByIdForProject(data.visitorId, project.id);
      if (existing && (!settings.requireAccount || existing.accountId)) {
        await this.visitorRepo.touch(existing.id, {
          currentUrl: data.currentUrl ?? null,
          referrer: data.referrer ?? null,
        });
        return (await this.visitorRepo.findById(existing.id)) as LiveChatVisitor;
      }
    }

    if (settings.requireAccount) {
      throw new AppError("This widget requires signing in", 401);
    }

    return this.visitorRepo.create({
      projectId: project.id,
      currentUrl: data.currentUrl ?? null,
      referrer: data.referrer ?? null,
    });
  }

  // ── Account auth (public, opt-in per project) ───────────────────────────────
  // Alternative front door to startVisitor above: instead of a free-form
  // pre-chat form, the visitor proves identity with a real password. Both
  // paths converge on the same thing — a LiveChatVisitor row whose id the
  // widget persists client-side — so every other endpoint (messaging, read
  // receipts, etc.) is completely unaware of which front door was used.

  private async assertAccountsRequired(project: Project): Promise<void> {
    const settings = await this.settingsRepo.getOrCreate(project.id);
    if (!settings.requireAccount) {
      throw new AppError("This widget doesn't use account sign-in", 400);
    }
  }

  async registerAccount(
    token: string,
    data: { name: string; email: string; password: string; phone?: string; currentUrl?: string; referrer?: string }
  ): Promise<LiveChatVisitor> {
    const project = await this.resolveProjectByToken(token);
    await this.assertAccountsRequired(project);

    const email = data.email.trim().toLowerCase();
    const existing = await this.accountRepo.findByProjectAndEmail(project.id, email);
    if (existing) {
      throw new AppError("An account with this email already exists — try logging in instead", 409);
    }

    const account = await this.accountRepo.create({
      projectId: project.id,
      email,
      password: await hashPassword(data.password),
      name: data.name.trim(),
      phone: data.phone ?? null,
    });
    await this.accountRepo.touchLastLogin(account.id);

    return this.visitorRepo.create({
      projectId: project.id,
      accountId: account.id,
      name: account.name,
      email: account.email,
      phone: account.phone,
      currentUrl: data.currentUrl ?? null,
      referrer: data.referrer ?? null,
    });
  }

  async loginAccount(
    token: string,
    data: { email: string; password: string; currentUrl?: string; referrer?: string }
  ): Promise<LiveChatVisitor> {
    const project = await this.resolveProjectByToken(token);
    await this.assertAccountsRequired(project);

    const email = data.email.trim().toLowerCase();
    const account = await this.accountRepo.findByProjectAndEmail(project.id, email);
    if (!account || !(await comparePassword(data.password, account.password))) {
      throw new AppError("Invalid email or password", 401);
    }
    await this.accountRepo.touchLastLogin(account.id);

    const existingVisitor = await this.visitorRepo.findByAccountId(account.id);
    if (!existingVisitor) {
      // Shouldn't normally happen (a visitor is created at registration) —
      // recover gracefully rather than leaving the account unusable.
      return this.visitorRepo.create({
        projectId: project.id,
        accountId: account.id,
        name: account.name,
        email: account.email,
        phone: account.phone,
        currentUrl: data.currentUrl ?? null,
        referrer: data.referrer ?? null,
      });
    }
    await this.visitorRepo.touch(existingVisitor.id, {
      currentUrl: data.currentUrl ?? null,
      referrer: data.referrer ?? null,
    });
    return (await this.visitorRepo.findById(existingVisitor.id)) as LiveChatVisitor;
  }

  // A visitor id from one project's widget must never resolve against another
  // project — each embed is a separate install (see LiveChatVisitorRepository).
  private async loadVisitor(
    token: string,
    visitorId: string
  ): Promise<{ project: Project; visitor: LiveChatVisitor }> {
    const project = await this.resolveProjectByToken(token);
    const visitor = await this.visitorRepo.findByIdForProject(visitorId, project.id);
    if (!visitor) throw new AppError("Visitor session not found — please refresh the page", 404);
    return { project, visitor };
  }

  // ── Visitor messaging (public) ──────────────────────────────────────────────

  // The widget binds to a single active conversation per visitor, created
  // lazily on first send — mirrors SupportChatService.getOrCreateMyConversation.
  private async getOrCreateConversation(
    project: Project,
    visitor: LiveChatVisitor
  ): Promise<LiveChatConversation> {
    const existing = await this.convRepo.findActiveByVisitor(visitor.id);
    if (existing) return existing;
    const created = await this.convRepo.create({
      projectId: project.id,
      visitorId: visitor.id,
      status: LiveChatStatus.NEW,
    });
    return (await this.convRepo.findById(created.id)) as LiveChatConversation;
  }

  // Who to alert when a visitor writes: the assigned agent if there is one,
  // else every org admin + project member — mirrors
  // FeedbackCommentService.resolveSupportHandlers/resolveProductTeamHandlers.
  private async resolveConversationHandlers(project: Project, conversation: LiveChatConversation) {
    if (conversation.assignedAgentId) {
      const agent = await this.authRepo.findUserById(conversation.assignedAgentId);
      return agent ? [agent] : [];
    }
    const [orgAdmins, members] = await Promise.all([
      project.organizationId
        ? this.authRepo.findByRoleAndOrg(UserRole.ADMIN, project.organizationId)
        : Promise.resolve([]),
      this.memberRepo.findMemberUsers(project.id),
    ]);
    return [...new Map([...orgAdmins, ...members].map((u: any) => [u.id, u])).values()];
  }

  async sendVisitorMessage(token: string, visitorId: string, body: string, files?: UploadedFile[]) {
    const { project, visitor } = await this.loadVisitor(token, visitorId);
    const text = (body || "").trim();
    const attachments = await this.uploadAttachments(files);
    if (!text && attachments.length === 0) {
      throw new AppError("A message or an attachment is required", 400);
    }

    const conversation = await this.getOrCreateConversation(project, visitor);
    const message = await this.messageRepo.create({
      conversationId: conversation.id,
      authorId: null,
      authorName: visitor.name || "Visitor",
      authorRole: "visitor",
      body: text,
      attachments,
    });

    const previewText = preview(text, attachments.length);

    // A visitor messaging again after being marked resolved reopens the same
    // thread (they're continuing the same issue); new/in_progress are
    // unaffected — only staff action moves those forward.
    const nextStatus =
      conversation.status === LiveChatStatus.RESOLVED ? LiveChatStatus.IN_PROGRESS : conversation.status;

    // Firestore write + Postgres denormalization aren't one transaction
    // (different stores) — accepted eventual-consistency tradeoff, same as
    // support-chat and feedback comments.
    await this.convRepo.update(conversation.id, {
      status: nextStatus,
      closedAt: null,
      lastMessageAt: new Date(),
      lastMessagePreview: previewText,
      lastSenderRole: "visitor",
      agentUnread: (conversation.agentUnread ?? 0) + 1,
    });

    this.resolveConversationHandlers(project, conversation)
      .then((recipients) => {
        if (recipients.length) {
          this.notificationService.notifyNewLiveChatMessage(recipients, {
            conversationId: conversation.id,
            projectId: project.id,
            senderName: visitor.name || "A visitor",
            preview: previewText,
          });
        }
      })
      .catch((e: Error) => console.error("[liveChat] new-message notify failed:", e.message));

    return message;
  }

  // Non-realtime fallback (the widget uses a Firestore onSnapshot listener
  // instead) — see LiveChatMessageRepository.fetchPaginated.
  async fetchMessagesForVisitor(token: string, visitorId: string, params: { page?: number; limit?: number }) {
    const { visitor } = await this.loadVisitor(token, visitorId);
    const conversation = await this.convRepo.findActiveByVisitor(visitor.id);
    if (!conversation) {
      return { data: [], meta: buildMeta(params.page ?? 1, params.limit ?? 50, 0, 0) };
    }
    return this.messageRepo.fetchPaginated(conversation.id, params);
  }

  // The widget's bootstrap/refresh call — the conversation id is what it needs
  // to open a Firestore realtime listener; null until the visitor's first
  // message (created lazily, same as support chat).
  async getVisitorConversation(token: string, visitorId: string): Promise<LiveChatConversation | null> {
    const { visitor } = await this.loadVisitor(token, visitorId);
    return this.convRepo.findActiveByVisitor(visitor.id);
  }

  async markReadByVisitor(token: string, visitorId: string): Promise<void> {
    const { visitor } = await this.loadVisitor(token, visitorId);
    const conversation = await this.convRepo.findActiveByVisitor(visitor.id);
    if (!conversation) return;
    await this.convRepo.update(conversation.id, { visitorUnread: 0 });
  }

  // Backs the pre-chat contact form and any mid-conversation "leave your email".
  async updateContact(
    token: string,
    visitorId: string,
    data: { name?: string; email?: string; phone?: string }
  ): Promise<LiveChatVisitor | null> {
    const { visitor } = await this.loadVisitor(token, visitorId);
    await this.visitorRepo.updateContact(visitor.id, data);
    return this.visitorRepo.findById(visitor.id);
  }

  // ── Staff (operator inbox) ──────────────────────────────────────────────────

  // Replying/claiming/closing: admins, this project's team lead, or whoever
  // the conversation is already assigned to — mirrors FeedbackCommentService's
  // "canManage || isAssignee" bar, adapted to live chat's single assignee.
  private async assertCanReply(actor: Actor, conversation: LiveChatConversation): Promise<void> {
    const canManage = await this.projectService.canManageProject(actor, conversation.projectId);
    if (canManage || conversation.assignedAgentId === actor.id) return;
    throw new AppError("Only admins, this project's team lead, or the assigned agent can do this", 403);
  }

  async listConversations(actor: Actor, params: FetchConversationsParams) {
    await this.projectService.getProject(actor, params.projectId); // throws if inaccessible
    return this.convRepo.fetchPaginated(params);
  }

  async getConversationForStaff(actor: Actor, id: string): Promise<LiveChatConversation> {
    const conversation = await this.convRepo.findById(id);
    if (!conversation) throw new AppError("Conversation not found", 404);
    await this.projectService.getProject(actor, conversation.projectId); // throws if inaccessible
    return conversation;
  }

  async fetchMessages(actor: Actor, id: string, params: { page?: number; limit?: number }) {
    await this.getConversationForStaff(actor, id);
    return this.messageRepo.fetchPaginated(id, params);
  }

  async sendAgentMessage(actor: Actor, id: string, body: string, files?: UploadedFile[]) {
    const conversation = await this.getConversationForStaff(actor, id);
    await this.assertCanReply(actor, conversation);

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
      authorRole: "agent",
      body: text,
      attachments,
    });

    const previewText = preview(text, attachments.length);

    // Any staff reply is "we're actively on it" — moves new/resolved/closed
    // forward (or keeps in_progress as-is); answering a closed thread reopens
    // it so the visitor's reply lands somewhere.
    await this.convRepo.update(conversation.id, {
      status: LiveChatStatus.IN_PROGRESS,
      closedAt: null,
      lastMessageAt: new Date(),
      lastMessagePreview: previewText,
      lastSenderRole: "agent",
      visitorUnread: (conversation.visitorUnread ?? 0) + 1,
      agentUnread: 0,
    });

    return message;
  }

  async markReadByAgent(actor: Actor, id: string): Promise<void> {
    const conversation = await this.getConversationForStaff(actor, id);
    await this.convRepo.update(conversation.id, { agentUnread: 0 });
  }

  // Restricted to this project's members — nobody outside the project can be
  // assigned (mirrors FeedbackService.manageFeedback's assignee resolution).
  async assignAgent(actor: Actor, id: string, agentId: string | null) {
    const conversation = await this.getConversationForStaff(actor, id);
    await this.projectService.assertCanManageProject(actor, conversation.projectId);

    if (agentId) {
      const members = await this.memberRepo.findMemberUsers(conversation.projectId);
      if (!members.some((m) => m.id === agentId)) {
        throw new AppError("You can only assign members of this project", 422);
      }
    }
    // Claiming an untouched conversation is itself "we're on it" — same
    // signal as a reply, without requiring one first.
    const statusPatch =
      agentId && conversation.status === LiveChatStatus.NEW ? { status: LiveChatStatus.IN_PROGRESS } : {};
    return this.convRepo.update(conversation.id, { assignedAgentId: agentId, ...statusPatch });
  }

  async setStatus(actor: Actor, id: string, status: string) {
    const conversation = await this.getConversationForStaff(actor, id);
    await this.assertCanReply(actor, conversation);
    return this.convRepo.update(conversation.id, {
      status,
      closedAt: status === LiveChatStatus.CLOSED ? new Date() : null,
    });
  }

  async listVisitors(actor: Actor, params: { projectId: string; page?: number; limit?: number; search?: string }) {
    await this.projectService.getProject(actor, params.projectId);
    return this.visitorRepo.fetchPaginated(params);
  }

  async getSettings(actor: Actor, projectId: string): Promise<LiveChatSettings> {
    await this.projectService.getProject(actor, projectId);
    return this.settingsRepo.getOrCreate(projectId);
  }

  async updateSettings(
    actor: Actor,
    projectId: string,
    patch: Partial<Omit<LiveChatSettings, "projectId" | "updatedBy" | "updatedAt" | "project">>
  ): Promise<LiveChatSettings> {
    await this.projectService.assertCanManageProject(actor, projectId);
    return this.settingsRepo.update(projectId, { ...patch, updatedBy: actor.id });
  }

  // Enabling/rotating/disabling a project's widget link — mirrors
  // FeedbackService.setFeedbackLink exactly (route-level restricts this to
  // admins, so no extra service-level role check here).
  async setWidgetLink(actor: Actor, projectId: string, enabled: boolean) {
    const project = await this.projectService.getProject(actor, projectId);
    // Rotating the widget link breaks every embedded copy: the team lead's call.
    await this.projectService.assertCanManageProject(actor, projectId);
    project.liveChatToken = enabled ? randomUUID() : null;
    await this.projectRepo.save(project);
    return { liveChatToken: project.liveChatToken };
  }
}
