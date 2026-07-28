// modules/feedback/services/feedbackComment.service.ts
// A ticket's back-and-forth comment thread — shared by the product-team
// routes, the IT-support portal routes, and the public (unauthenticated)
// submitter routes, so the "who's allowed to read/write this ticket's
// thread" logic lives in exactly one place instead of three.
import { FeedbackRepository } from "../repositories/feedback.repository";
import { FeedbackCommentRepository } from "../repositories/feedbackComment.repository";
import { FeedbackLookupCodeRepository } from "../repositories/feedbackLookupCode.repository";
import { ProjectRepository } from "../../project/repositories/project.repository";
import { ProjectService } from "../../project/services/project.service";
import { ProjectMemberRepository } from "../../project/repositories/projectMember.repository";
import { ClientCompanyRepository } from "../../clientCompany/repositories/clientCompany.repository";
import { ticketLabel } from "../dto/feedback.dto";
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
const { UserRole, SupportStatus } = require("../../../config/constants");
const { env } = require("../../../config/env");

const MAX_ATTACHMENTS_PER_COMMENT = 5;
const CLOUDINARY_FOLDER = "testmate/feedback-comments";

type UploadedFile = { buffer: Buffer; originalname: string; mimetype: string; size: number };

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

  // A ticket is IT-support-owned while it's company-routed and not yet
  // escalated — same condition FeedbackRepository.fetchPaginated and
  // feedback.dto.ts's toMyTicketNote already use to decide which tier "owns" it.
  private isSupportOwned(fb: Feedback): boolean {
    return Boolean(fb.clientCompanyId) && fb.supportStatus !== SupportStatus.ESCALATED;
  }

  // ── Staff access ─────────────────────────────────────────────────────────
  // Mirrors the access rules FeedbackService.manageFeedback and
  // FeedbackSupportService.getOwnItem/getAssignedItem already enforce for the
  // single note field — reading matches who can already see the ticket at
  // all, writing is restricted to whoever can actually act on it.
  private async loadForStaff(
    actor: Actor,
    feedbackId: string,
    { forWrite }: { forWrite: boolean }
  ): Promise<Feedback> {
    const fb = await this.feedbackRepo.findById(feedbackId);
    if (!fb || fb.deletedAt) throw new AppError("Feedback not found", 404);

    if (this.isSupportOwned(fb)) {
      if (actor.role !== UserRole.IT_SUPPORT || actor.clientCompanyId !== fb.clientCompanyId) {
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

    if (actor.role === UserRole.IT_SUPPORT) throw new AppError("Feedback not found", 404);
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
  // Same credential as "My Tickets" (email + the emailed OTP code) — see
  // FeedbackService.listMyTickets.
  private async loadForSubmitter(feedbackId: string, email: string, code: string): Promise<Feedback> {
    const active = await this.lookupCodeRepo.findActive(email, hashToken(code));
    if (!active) throw new AppError("Invalid or expired code", 401);

    const fb = await this.feedbackRepo.findById(feedbackId);
    if (!fb || fb.deletedAt || fb.submitterEmail.toLowerCase() !== email.toLowerCase()) {
      throw new AppError("Feedback not found", 404);
    }

    // Same rule as feedback.dto.ts's toMyTicketNote: once a company ticket is
    // escalated, the true submitter is deliberately kept out of the internal
    // handoff until support explicitly relays a fix (submitterNotifiedAt).
    if (fb.clientCompanyId && fb.supportStatus === SupportStatus.ESCALATED && !fb.submitterNotifiedAt) {
      throw new AppError("This ticket has been escalated — check back soon for an update", 403);
    }

    return fb;
  }

  private assertAttachmentCount(files?: UploadedFile[]): void {
    if (files && files.length > MAX_ATTACHMENTS_PER_COMMENT) {
      throw new AppError(`A comment can have at most ${MAX_ATTACHMENTS_PER_COMMENT} attachments`, 422);
    }
  }

  // Screenshots go through Cloudinary's image pipeline; everything else
  // (PDF/Word/Excel) goes through the raw pipeline — see StorageService.
  private async uploadAttachments(commentId: string, files?: UploadedFile[]): Promise<void> {
    if (!files || files.length === 0) return;
    const uploaded = [];
    for (const file of files) {
      const isImage = ALLOWED_IMAGE_TYPES.includes(file.mimetype);
      const result = isImage
        ? await this.storage.uploadImage(file.buffer, { folder: CLOUDINARY_FOLDER })
        : await this.storage.uploadRaw(file.buffer, { folder: CLOUDINARY_FOLDER });
      uploaded.push({
        fileName: file.originalname,
        fileUrl: result.url,
        filePublicId: result.publicId,
        mimeType: file.mimetype,
        fileSizeBytes: file.size,
      });
    }
    await this.commentRepo.addAttachments(commentId, uploaded);
  }

  // Who staff replies get emailed to — the escalating supporter once a
  // company ticket is escalated (they relay to their own end user), else the
  // true submitter. Mirrors FeedbackService.resolveEmailRecipient.
  private async resolveExternalRecipient(fb: Feedback): Promise<{ email: string; name: string }> {
    if (fb.escalatedById) {
      const supporter = fb.escalatedBy ?? (await this.authRepo.findUserById(fb.escalatedById));
      if (supporter) {
        return {
          email: supporter.email,
          name: [supporter.firstName, supporter.lastName].filter(Boolean).join(" "),
        };
      }
    }
    return { email: fb.submitterEmail, name: fb.submitterName };
  }

  // Who gets notified when the submitter replies to an IT-support-owned
  // ticket — the assigned supporter if there is one, else every company lead.
  // Mirrors FeedbackSupportService.resolveActiveHandlers.
  private async resolveSupportHandlers(fb: Feedback): Promise<any[]> {
    if (fb.assignedSupporterId) {
      const supporter = await this.userRepo.findById(fb.assignedSupporterId);
      return supporter ? [supporter] : [];
    }
    const supporters = await this.userRepo.findByClientCompany(fb.clientCompanyId as string);
    return supporters.filter((s: any) => s.isSupportLead);
  }

  // Who gets notified when the submitter replies to a product-tier ticket —
  // same fan-out as a brand-new submission (org admins + project members).
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

  async addForStaff(actor: Actor, feedbackId: string, body: string, files?: UploadedFile[]) {
    const fb = await this.loadForStaff(actor, feedbackId, { forWrite: true });
    this.assertAttachmentCount(files);

    const author = await this.authRepo.findUserById(actor.id);
    const authorName = author
      ? [author.firstName, author.lastName].filter(Boolean).join(" ")
      : "A staff member";

    const comment = await this.commentRepo.create({
      feedbackId,
      authorType: "staff",
      authorId: actor.id,
      authorName,
      body,
    });
    await this.uploadAttachments(comment.id, files);
    await this.feedbackRepo.incrementCommentCount(feedbackId);

    const [project, company, recipient] = await Promise.all([
      this.projectRepo.findById(fb.projectId),
      fb.clientCompanyId ? this.companyRepo.findById(fb.clientCompanyId) : Promise.resolve(null),
      this.resolveExternalRecipient(fb),
    ]);

    sendFeedbackCommentEmail(
      recipient.email,
      recipient.name,
      ticketLabel(fb),
      authorName,
      `${env.appUrl}/my-tickets`,
      project?.organizationId ?? null
    ).catch((e: Error) => console.error("[feedback] comment email failed:", e.message));

    ActivityService.Instance.log(actor, {
      action: "feedback.comment_added",
      summary: `${authorName} commented on "${fb.title}"${company ? ` for "${company.name}"` : ""}`,
      entityType: "feedback",
      entityId: fb.id,
      clientCompanyId: fb.clientCompanyId,
      metadata: { projectId: fb.projectId },
    });

    return (await this.commentRepo.findById(comment.id)) ?? comment;
  }

  // ── Submitter-facing (public, unauthenticated) ──────────────────────────

  async listForSubmitter(feedbackId: string, email: string, code: string) {
    await this.loadForSubmitter(feedbackId, email, code);
    return this.commentRepo.findByFeedback(feedbackId);
  }

  async addForSubmitter(
    feedbackId: string,
    email: string,
    code: string,
    body: string,
    files?: UploadedFile[]
  ) {
    const fb = await this.loadForSubmitter(feedbackId, email, code);
    this.assertAttachmentCount(files);

    const comment = await this.commentRepo.create({
      feedbackId,
      authorType: "submitter",
      authorId: null,
      authorName: fb.submitterName,
      body,
    });
    await this.uploadAttachments(comment.id, files);
    await this.feedbackRepo.incrementCommentCount(feedbackId);

    const project = await this.projectRepo.findById(fb.projectId);
    const support = this.isSupportOwned(fb);
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

    return (await this.commentRepo.findById(comment.id)) ?? comment;
  }
}
