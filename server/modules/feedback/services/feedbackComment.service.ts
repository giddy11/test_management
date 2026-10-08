// modules/feedback/services/feedbackComment.service.ts
// A ticket's back-and-forth comment thread — shared by the product-team
// routes, the IT-support portal routes, and the public (unauthenticated)
// submitter routes, so the "who's allowed to read/write this ticket's
// thread" logic lives in exactly one place instead of three.
//
// Once a company ticket is escalated, BOTH staff sides (the escalating
// company's IT support and the product team now handling it) keep access to
// the same thread — this is deliberately not the same "un-escalated items
// aren't the product org's business yet" wall the rest of ticket management
// enforces (see FeedbackService.assertVisibleToOrg): a support thread is
// exactly the place those two sides need to be able to talk to each other.
// The true (unauthenticated) submitter is the one party still gated by the
// existing "hidden until relayed" rule post-escalation.
import { FeedbackRepository } from "../repositories/feedback.repository";
import {
  FeedbackCommentRepository,
  type FeedbackComment,
  type FeedbackCommentAttachment,
} from "../repositories/feedbackComment.repository";
import { FeedbackLookupCodeRepository } from "../repositories/feedbackLookupCode.repository";
import { ProjectRepository } from "../../project/repositories/project.repository";
import { ProjectService } from "../../project/services/project.service";
import { ProjectMemberRepository } from "../../project/repositories/projectMember.repository";
import { ClientCompanyRepository } from "../../clientCompany/repositories/clientCompany.repository";
import { SubmitterTicketStatus, ticketLabel, toSubmitterStatus } from "../dto/feedback.dto";
import { sendTicketTranscriptEmail } from "../../../shared/utils/mail/ticket.mail";
import type { Actor } from "../../../shared/types/actor";
import type { Feedback } from "../entities/feedback.entity";

const { AuthRepository } = require("../../auth/repositories/auth.repository");
const { UserRepository } = require("../../user/repositories/user.repository");
const { NotificationService } = require("../../notification/services/notification.service");
const { ActivityService } = require("../../activity/services/activity.service");
const { StorageService } = require("../../../shared/services/storage.service");
const { ALLOWED_IMAGE_TYPES } = require("../../../shared/middleware/upload.middleware");
const { sendFeedbackCommentEmail } = require("../../../shared/utils/mailer");
const { hashToken } = require("../../../shared/utils/password");
const { AppError } = require("../../../shared/errors/AppError");
const {
  isExternalSupporter,
} = require("../../../shared/access/scope");
const { UserRole, SupportStatus } = require("../../../config/constants");
const { env } = require("../../../config/env");

const MAX_ATTACHMENTS_PER_COMMENT = 5;
const CLOUDINARY_FOLDER = "testmate/feedback-comments";

type UploadedFile = { buffer: Buffer; originalname: string; mimetype: string; size: number };

// The submitter's collapsed view of a ticket's status (see toSubmitterStatus)
// — same wording as the My Tickets page.
const SUBMITTER_STATUS_LABELS: Record<string, string> = {
  [SubmitterTicketStatus.RECEIVED]: "Received",
  [SubmitterTicketStatus.IN_PROGRESS]: "In progress",
  [SubmitterTicketStatus.RESOLVED]: "Resolved",
};

export class FeedbackCommentService {
  static Instance = new FeedbackCommentService();

  feedbackRepo: FeedbackRepository;
  commentRepo: FeedbackCommentRepository;
  lookupCodeRepo: FeedbackLookupCodeRepository;
  projectRepo: ProjectRepository;
  projectService: ProjectService;
  memberRepo: ProjectMemberRepository;
  companyRepo: ClientCompanyRepository;
  authRepo: any;
  userRepo: any;
  notificationService: any;
  storage: any;

  constructor(
    feedbackRepo = FeedbackRepository.Instance,
    commentRepo = FeedbackCommentRepository.Instance,
    lookupCodeRepo = FeedbackLookupCodeRepository.Instance,
    projectRepo = ProjectRepository.Instance,
    projectService = ProjectService.Instance,
    memberRepo = ProjectMemberRepository.Instance,
    companyRepo = ClientCompanyRepository.Instance,
    authRepo = AuthRepository.Instance,
    userRepo = UserRepository.Instance,
    notificationService = NotificationService.Instance,
    storage = StorageService.Instance
  ) {
    this.feedbackRepo = feedbackRepo;
    this.commentRepo = commentRepo;
    this.lookupCodeRepo = lookupCodeRepo;
    this.projectRepo = projectRepo;
    this.projectService = projectService;
    this.memberRepo = memberRepo;
    this.companyRepo = companyRepo;
    this.authRepo = authRepo;
    this.userRepo = userRepo;
    this.notificationService = notificationService;
    this.storage = storage;
  }

  private isEscalated(fb: Feedback): boolean {
    return Boolean(fb.clientCompanyId) && fb.supportStatus === SupportStatus.ESCALATED;
  }

  // A reply always threads under a root message: replying to a reply resolves
  // to that reply's own parent, so there's never a third level to render.
  private async resolveParentId(feedbackId: string, parentId?: string | null): Promise<string | null> {
    if (!parentId) return null;
    const parent = await this.commentRepo.findById(parentId);
    if (!parent || parent.feedbackId !== feedbackId) {
      throw new AppError("Message not found", 404);
    }
    return parent.parentId ?? parent.id;
  }

  // Staff-to-staff only — the submitter has no account and can't be
  // mentioned. A pick is only honored if that user could actually load this
  // exact ticket as staff (same three-way access rules as loadForStaff),
  // not just "any org member" — the client's candidate list is broader than
  // that and this is the real gate.
  private async resolveMentions(
    feedbackId: string,
    actorId: string,
    mentionedUserIds?: string[]
  ): Promise<{ userId: string; name: string }[]> {
    if (!mentionedUserIds || mentionedUserIds.length === 0) return [];
    const uniqueIds = [...new Set(mentionedUserIds)].filter((uid) => uid !== actorId);
    const resolved: { userId: string; name: string }[] = [];
    for (const uid of uniqueIds) {
      let user;
      try {
        user = await this.authRepo.findUserById(uid);
      } catch {
        continue; // malformed id — not a real uuid
      }
      if (!user) continue;
      const pseudoActor = {
        id: user.id,
        role: user.role,
        organizationId: user.organizationId,
        clientCompanyId: user.clientCompanyId,
        isSupportLead: user.isSupportLead,
      };
      try {
        await this.loadForStaff(pseudoActor, feedbackId, { forWrite: false });
      } catch {
        continue; // can't actually see this ticket as staff
      }
      resolved.push({ userId: user.id, name: [user.firstName, user.lastName].filter(Boolean).join(" ") });
    }
    return resolved;
  }

  // ── Staff access ─────────────────────────────────────────────────────────
  // Reading matches who can already see the ticket at all; writing is
  // restricted to whoever can actually act on it — same bar
  // FeedbackService.manageFeedback and FeedbackSupportService's
  // getOwnItem/getAssignedItem already enforce for the single note field.
  // Unlike those, an IT supporter's access here doesn't end at escalation —
  // see the file-level comment above.
  private async loadForStaff(
    actor: Actor,
    feedbackId: string,
    { forWrite }: { forWrite: boolean }
  ): Promise<Feedback> {
    const fb = await this.feedbackRepo.findById(feedbackId);
    if (!fb || fb.deletedAt) throw new AppError("Feedback not found", 404);

    if (isExternalSupporter(actor)) {
      if (!fb.clientCompanyId || actor.clientCompanyId !== fb.clientCompanyId) {
        throw new AppError("Feedback not found", 404);
      }
      if (forWrite && !actor.isSupportLead && fb.assignedSupporterId !== actor.id) {
        throw new AppError(
          fb.assignedSupporterId
            ? "This ticket is assigned to someone else — ask a lead to reassign it to you"
            : "This ticket isn't assigned to anyone yet — ask a lead to assign it to you first",
          403
        );
      }
      return fb;
    }

    // Product tier: an un-escalated company ticket isn't theirs yet.
    if (fb.clientCompanyId && fb.supportStatus !== SupportStatus.ESCALATED) {
      throw new AppError("Feedback not found", 404);
    }
    await this.projectService.getProject(actor, fb.projectId); // throws if the actor can't see this project at all
    if (forWrite) {
      const canManage = await this.projectService.canManageProject(actor, fb.projectId);
      const isAssignee = (fb.assignees ?? []).some((u) => u.id === actor.id);
      if (!canManage && !isAssignee) {
        throw new AppError("Only admins, this project's team lead, or an assignee can do this", 403);
      }
    }
    return fb;
  }

  // ── Submitter access ─────────────────────────────────────────────────────
  // Same rule either way in: once a company ticket is escalated, the true
  // submitter is deliberately kept out of the internal IT-support/product-team
  // handoff until support explicitly relays a fix (submitterNotifiedAt) — same
  // condition feedback.dto.ts's toMyTicketNote uses for the single note field.
  private assertSubmitterVisible(fb: Feedback): void {
    if (fb.clientCompanyId && fb.supportStatus === SupportStatus.ESCALATED && !fb.submitterNotifiedAt) {
      throw new AppError("This ticket has been escalated — check back soon for an update", 403);
    }
  }

  // Proof of ownership: email + the emailed OTP code, same as "My Tickets" —
  // see FeedbackService.listMyTickets.
  private async loadForSubmitterByCode(feedbackId: string, email: string, code: string): Promise<Feedback> {
    const active = await this.lookupCodeRepo.findActive(email, hashToken(code));
    if (!active) throw new AppError("Invalid or expired code", 401);

    const fb = await this.feedbackRepo.findById(feedbackId);
    if (!fb || fb.deletedAt || fb.submitterEmail.toLowerCase() !== email.toLowerCase()) {
      throw new AppError("Feedback not found", 404);
    }
    this.assertSubmitterVisible(fb);
    return fb;
  }

  private assertAttachmentCount(files?: UploadedFile[]): void {
    if (files && files.length > MAX_ATTACHMENTS_PER_COMMENT) {
      throw new AppError(`A comment can have at most ${MAX_ATTACHMENTS_PER_COMMENT} attachments`, 422);
    }
  }

  // Screenshots go through Cloudinary's image pipeline; everything else
  // (PDF/Word/Excel) goes through the raw pipeline — see StorageService.
  // Returns metadata to denormalize directly onto the Firestore comment doc
  // (Firestore has no join, same reason supportChatMessage embeds its own).
  private async uploadAttachments(files?: UploadedFile[]): Promise<FeedbackCommentAttachment[]> {
    if (!files || files.length === 0) return [];
    const uploaded: FeedbackCommentAttachment[] = [];
    for (const file of files) {
      const isImage = ALLOWED_IMAGE_TYPES.includes(file.mimetype);
      const result = isImage
        ? await this.storage.uploadImage(file.buffer, { folder: CLOUDINARY_FOLDER })
        : await this.storage.uploadRaw(file.buffer, { folder: CLOUDINARY_FOLDER });
      uploaded.push({
        url: result.url,
        publicId: result.publicId,
        name: file.originalname,
        mimeType: file.mimetype,
        bytes: result.bytes ?? file.size,
      });
    }
    return uploaded;
  }

  // Who gets notified when the submitter replies to an IT-support-owned
  // ticket — the assigned supporter if there is one, else every company lead.
  // Also doubles as "the product team's contact on the IT-support side" once
  // a ticket is escalated. Mirrors FeedbackSupportService.resolveActiveHandlers.
  private async resolveSupportHandlers(fb: Feedback): Promise<any[]> {
    if (fb.assignedSupporterId) {
      const supporter = await this.userRepo.findById(fb.assignedSupporterId);
      return supporter ? [supporter] : [];
    }
    const supporters = await this.userRepo.findByClientCompany(fb.clientCompanyId as string);
    return supporters.filter((s: any) => s.isSupportLead);
  }

  // Who gets notified when the submitter replies to a product-tier ticket, or
  // when IT support posts on a now-escalated one — org admins + project members.
  private async resolveProductTeamHandlers(fb: Feedback, organizationId?: string | null): Promise<any[]> {
    const [orgAdmins, members] = await Promise.all([
      organizationId ? this.authRepo.findByRoleAndOrg(UserRole.ADMIN, organizationId) : Promise.resolve([]),
      this.memberRepo.findMemberUsers(fb.projectId),
    ]);
    return [...new Map([...orgAdmins, ...members].map((u: any) => [u.id, u])).values()];
  }

  // ── Staff-facing ─────────────────────────────────────────────────────────

  async listForStaff(actor: Actor, feedbackId: string) {
    await this.loadForStaff(actor, feedbackId, { forWrite: false });
    return this.commentRepo.findByFeedback(feedbackId);
  }

  async addForStaff(
    actor: Actor,
    feedbackId: string,
    body: string,
    files?: UploadedFile[],
    parentId?: string | null,
    mentionedUserIds?: string[]
  ) {
    const fb = await this.loadForStaff(actor, feedbackId, { forWrite: true });
    this.assertAttachmentCount(files);
    const resolvedParentId = await this.resolveParentId(feedbackId, parentId);
    const mentions = await this.resolveMentions(feedbackId, actor.id, mentionedUserIds);

    const author = await this.authRepo.findUserById(actor.id);
    const authorName = author
      ? [author.firstName, author.lastName].filter(Boolean).join(" ")
      : "A staff member";

    const attachments = await this.uploadAttachments(files);
    const comment = await this.commentRepo.create({
      feedbackId,
      parentId: resolvedParentId,
      authorType: "staff",
      authorId: actor.id,
      authorName,
      authorRole: actor.role,
      body,
      attachments,
      mentions,
    });
    await this.feedbackRepo.incrementCommentCount(feedbackId);
    // SLA: a staff reply is the first response when it lands before any stage
    // change (see modules/sla). Set once, never moved.
    if (!fb.firstResponseAt) {
      await this.feedbackRepo.update(fb.id, { firstResponseAt: comment.createdAt ?? new Date() });
    }

    const [project, company] = await Promise.all([
      this.projectRepo.findById(fb.projectId),
      fb.clientCompanyId ? this.companyRepo.findById(fb.clientCompanyId) : Promise.resolve(null),
    ]);

    if (mentions.length) {
      Promise.all(mentions.map((m) => this.authRepo.findUserById(m.userId)))
        .then((users) => {
          for (const u of users) {
            if (!u) continue;
            this.notificationService.notifyFeedbackMention(u, {
              feedbackId: fb.id,
              projectId: fb.projectId,
              title: ticketLabel(fb),
              mentionerName: authorName,
              support: u.role === UserRole.IT_SUPPORT,
              organizationId: project?.organizationId ?? null,
            });
          }
        })
        .catch((e: Error) => console.error("[feedback] mention notify failed:", e.message));
    }

    if (this.isEscalated(fb)) {
      // Both staff sides of an escalated ticket now share this thread —
      // notify whichever side didn't post, in-app + email, same as any
      // other staff notification (they both have real accounts/inboxes).
      const posterIsSupport = isExternalSupporter(actor);
      const recipients = posterIsSupport
        ? await this.resolveProductTeamHandlers(fb, project?.organizationId)
        : await this.resolveSupportHandlers(fb);
      if (recipients.length) {
        this.notificationService
          .notifyFeedbackComment(recipients, {
            feedbackId: fb.id,
            projectId: fb.projectId,
            projectName: project?.name ?? "",
            title: ticketLabel(fb),
            commenterName: authorName,
            support: !posterIsSupport,
            organizationId: project?.organizationId ?? null,
          })
          .catch((e: Error) => console.error("[feedback] comment notify failed:", e.message));
      }
    } else {
      // Pre-escalation or a direct ticket — the other side is the true,
      // unauthenticated submitter, who has no in-app inbox to notify. Their
      // reply-to identity stays "Support team" — individual staff names are
      // internal, same as the in-app conversation view.
      sendFeedbackCommentEmail(
        fb.submitterEmail,
        fb.submitterName,
        ticketLabel(fb),
        "Support team",
        `${env.appUrl}/my-tickets`,
        project?.organizationId ?? null
      ).catch((e: Error) => console.error("[feedback] comment email failed:", e.message));
    }

    ActivityService.Instance.log(actor, {
      action: "feedback.comment_added",
      summary: `${authorName} commented on "${fb.title}"${company ? ` for "${company.name}"` : ""}`,
      entityType: "feedback",
      entityId: fb.id,
      clientCompanyId: fb.clientCompanyId,
      metadata: { projectId: fb.projectId },
    });

    return comment;
  }

  // ── Submitter-facing (public, unauthenticated) ──────────────────────────

  async listForSubmitter(feedbackId: string, email: string, code: string) {
    await this.loadForSubmitterByCode(feedbackId, email, code);
    return this.commentRepo.findByFeedback(feedbackId);
  }

  // Emails the submitter the whole conversation — their original message
  // plus every reply — on request from the WhatsApp widget's ticket view.
  // Always to the ticket's own address (already proven by the code), never
  // to one supplied with the request.
  async emailTranscriptToSubmitter(
    feedbackId: string,
    email: string,
    code: string,
    timeZone?: string
  ): Promise<void> {
    const fb = await this.loadForSubmitterByCode(feedbackId, email, code);
    const [comments, project] = await Promise.all([
      this.commentRepo.findByFeedback(feedbackId),
      this.projectRepo.findById(fb.projectId),
    ]);

    try {
      await sendTicketTranscriptEmail({
        to: fb.submitterEmail,
        name: fb.submitterName,
        ticketLabel: ticketLabel(fb),
        productName: project?.name ?? "your product",
        statusLabel: SUBMITTER_STATUS_LABELS[toSubmitterStatus(fb)] ?? "Received",
        originalMessage: fb.description,
        originalAt: fb.createdAt,
        entries: comments.map((c) => ({
          author: c.authorType === "submitter" ? "You" : "Support team",
          fromSubmitter: c.authorType === "submitter",
          body: c.body,
          attachments: (c.attachments ?? []).map((a) => ({ url: a.url, name: a.name ?? null })),
          createdAt: c.createdAt,
        })),
        url: `${env.appUrl}/my-tickets`,
        timeZone,
        organizationId: project?.organizationId ?? null,
      });
    } catch (e) {
      console.error("[feedback] transcript email failed:", (e as Error).message);
      throw new AppError("Couldn't send the transcript right now — please try again shortly", 502);
    }
  }

  async addForSubmitter(
    feedbackId: string,
    email: string,
    code: string,
    body: string,
    files?: UploadedFile[],
    parentId?: string | null
  ): Promise<FeedbackComment> {
    if (!body.trim() && !files?.length) {
      throw new AppError("Write a message or attach a file", 422);
    }
    const fb = await this.loadForSubmitterByCode(feedbackId, email, code);
    return this.createSubmitterComment(fb, body.trim(), files, parentId);
  }

  private async createSubmitterComment(
    fb: Feedback,
    body: string,
    files?: UploadedFile[],
    parentId?: string | null
  ): Promise<FeedbackComment> {
    this.assertAttachmentCount(files);
    const resolvedParentId = await this.resolveParentId(fb.id, parentId);

    const attachments = await this.uploadAttachments(files);
    const comment = await this.commentRepo.create({
      feedbackId: fb.id,
      parentId: resolvedParentId,
      authorType: "submitter",
      authorId: null,
      authorName: fb.submitterName,
      body,
      attachments,
    });
    await this.feedbackRepo.incrementCommentCount(fb.id);

    const project = await this.projectRepo.findById(fb.projectId);
    const support = Boolean(fb.clientCompanyId) && fb.supportStatus !== SupportStatus.ESCALATED;
    const recipients = support
      ? await this.resolveSupportHandlers(fb)
      : await this.resolveProductTeamHandlers(fb, project?.organizationId);

    if (recipients.length) {
      this.notificationService
        .notifyFeedbackComment(recipients, {
          feedbackId: fb.id,
          projectId: fb.projectId,
          projectName: project?.name ?? "",
          title: ticketLabel(fb),
          commenterName: fb.submitterName,
          support,
          organizationId: project?.organizationId ?? null,
        })
        .catch((e: Error) => console.error("[feedback] comment notify failed:", e.message));
    }

    ActivityService.Instance.log(
      { id: null, organizationId: project?.organizationId ?? null },
      {
        action: "feedback.comment_added",
        summary: `${fb.submitterName} replied on "${fb.title}"`,
        entityType: "feedback",
        entityId: fb.id,
        clientCompanyId: fb.clientCompanyId,
        metadata: { projectId: fb.projectId },
      }
    );

    return comment;
  }
}
