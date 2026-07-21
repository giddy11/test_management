// modules/feedback/services/feedbackSupport.service.ts
// The client-company IT support tier. Supporters (role it_support) work their
// own company's queue: resolve items locally (the end user is emailed the
// note) or escalate to the product owner's team — after which the item enters
// the normal triage workflow and lifecycle emails go to the escalating
// supporter, who relays to their users.
import { FeedbackRepository } from "../repositories/feedback.repository";
import { FeedbackStatusHistoryRepository } from "../repositories/feedbackStatusHistory.repository";
import { FeedbackSupportStatusHistoryRepository } from "../repositories/feedbackSupportStatusHistory.repository";
import { ClientCompanyRepository } from "../../clientCompany/repositories/clientCompany.repository";
import { ProjectRepository } from "../../project/repositories/project.repository";
import { ProjectMemberRepository } from "../../project/repositories/projectMember.repository";
import { ticketLabel } from "../dto/feedback.dto";
import type { Actor } from "../../../shared/types/actor";
import type { Feedback } from "../entities/feedback.entity";

const { AuthRepository } = require("../../auth/repositories/auth.repository");
const { UserRepository } = require("../../user/repositories/user.repository");
const { NotificationService } = require("../../notification/services/notification.service");
const { ActivityService } = require("../../activity/services/activity.service");
const {
  sendSupportResolutionEmail,
  sendSupportStatusEmail,
} = require("../../../shared/utils/mail/support.mail");
const { sendFeedbackConfirmationReceivedEmail } = require("../../../shared/utils/mailer");
const { AppError } = require("../../../shared/errors/AppError");
const { UserRole, FeedbackStatus, SupportStatus } = require("../../../config/constants");
const { env } = require("../../../config/env");

// The IT tier's working stages, in order. Resolved/escalated are terminal
// outcomes reached via their dedicated actions — only from "investigating".
const SUPPORT_PROGRESSION: string[] = [
  SupportStatus.LOGGED,
  SupportStatus.ACKNOWLEDGED,
  SupportStatus.INVESTIGATING,
];

const SUPPORT_STATUS_LABELS: Record<string, string> = {
  [SupportStatus.LOGGED]: "Logged",
  [SupportStatus.ACKNOWLEDGED]: "Acknowledged",
  [SupportStatus.INVESTIGATING]: "Under investigation",
  [SupportStatus.AWAITING_CONFIRMATION]: "Awaiting confirmation",
  [SupportStatus.RESOLVED]: "Resolved",
  [SupportStatus.ESCALATED]: "Escalated to the product team",
};

// Copy for the end user's stage emails (resolved has its own richer email).
const SUPPORT_EMAIL_COPY: Record<string, string> = {
  [SupportStatus.ACKNOWLEDGED]:
    "Your IT support team has acknowledged your feedback and it's in their queue.",
  [SupportStatus.INVESTIGATING]:
    "Your IT support team is actively investigating your feedback.",
  [SupportStatus.ESCALATED]:
    "Your IT support team couldn't resolve this locally and has escalated it to the product team. Your IT support team will keep you posted as it progresses.",
};

// Strictly sequential, like the product flow — only the very next working
// stage can be picked; no skipping or moving backward.
function assertValidSupportTransition(current: string, next: string): void {
  if (current === next) return;
  const from = SUPPORT_PROGRESSION.indexOf(current);
  const to = SUPPORT_PROGRESSION.indexOf(next);
  if (from === -1 || to !== from + 1) {
    const expected = from >= 0 ? SUPPORT_PROGRESSION[from + 1] : undefined;
    const message = expected
      ? `Support items move through the workflow in order — the next stage from "${SUPPORT_STATUS_LABELS[current]}" is "${SUPPORT_STATUS_LABELS[expected]}".`
      : `This item is already ${SUPPORT_STATUS_LABELS[current]?.toLowerCase() ?? current} and can't change stage.`;
    throw new AppError(message, 422);
  }
}

export interface SupportQueueParams {
  page?: number;
  limit?: number;
  supportStatus?: string;
  type?: string;
  search?: string;
  assignedSupporterId?: string;
  unassigned?: boolean;
}

export class FeedbackSupportService {
  static Instance = new FeedbackSupportService();

  feedbackRepo: FeedbackRepository;
  historyRepo: FeedbackStatusHistoryRepository;
  companyRepo: ClientCompanyRepository;
  projectRepo: ProjectRepository;
  memberRepo: ProjectMemberRepository;
  authRepo: any;
  userRepo: any;
  notificationService: any;
  supportHistoryRepo: FeedbackSupportStatusHistoryRepository;

  constructor(
    feedbackRepo = FeedbackRepository.Instance,
    historyRepo = FeedbackStatusHistoryRepository.Instance,
    companyRepo = ClientCompanyRepository.Instance,
    projectRepo = ProjectRepository.Instance,
    memberRepo = ProjectMemberRepository.Instance,
    authRepo = AuthRepository.Instance,
    userRepo = UserRepository.Instance,
    notificationService = NotificationService.Instance,
    supportHistoryRepo = FeedbackSupportStatusHistoryRepository.Instance
  ) {
    this.feedbackRepo = feedbackRepo;
    this.historyRepo = historyRepo;
    this.companyRepo = companyRepo;
    this.projectRepo = projectRepo;
    this.memberRepo = memberRepo;
    this.authRepo = authRepo;
    this.userRepo = userRepo;
    this.notificationService = notificationService;
    this.supportHistoryRepo = supportHistoryRepo;
  }

  // Every portal call must come from a supporter with a company. Returns the id.
  private requireCompany(actor: Actor): string {
    if (actor.role !== UserRole.IT_SUPPORT || !actor.clientCompanyId) {
      throw new AppError("Only IT supporters can access the support queue", 403);
    }
    return actor.clientCompanyId;
  }

  // Loads an item and asserts it belongs to the actor's company.
  private async getOwnItem(actor: Actor, id: string): Promise<Feedback> {
    const companyId = this.requireCompany(actor);
    const fb = await this.feedbackRepo.findById(id);
    if (!fb || fb.deletedAt || fb.clientCompanyId !== companyId) {
      throw new AppError("Feedback not found", 404);
    }
    return fb;
  }

  // Same as getOwnItem, but for the actions that actually change something
  // (stage moves, resolve, escalate, notify-submitter). Leads can act on any
  // item in their company — they're the ones who assign it in the first
  // place — but a non-lead supporter may only act on tickets assigned to
  // them, so peers can't step on each other's queue items.
  private async getAssignedItem(actor: Actor, id: string): Promise<Feedback> {
    const fb = await this.getOwnItem(actor, id);
    if (!actor.isSupportLead && fb.assignedSupporterId !== actor.id) {
      throw new AppError(
        fb.assignedSupporterId
          ? "This ticket is assigned to someone else — ask a lead to reassign it to you"
          : "This ticket isn't assigned to anyone yet — ask a lead to assign it to you first",
        403
      );
    }
    return fb;
  }

  async fetchQueue(actor: Actor, params: SupportQueueParams) {
    const clientCompanyId = this.requireCompany(actor);
    return this.feedbackRepo.fetchPaginated({ ...params, clientCompanyId });
  }

  // Lets a lead pick a teammate to route a queue item to.
  async listTeammates(actor: Actor) {
    const companyId = this.requireCompany(actor);
    if (!actor.isSupportLead) {
      throw new AppError("Only IT support leads can view the teammate list", 403);
    }
    return this.userRepo.findByClientCompany(companyId);
  }

  // IT-tier stage timeline (logged → … ) for one of the supporter's own items.
  async getSupportTimeline(actor: Actor, id: string) {
    const fb = await this.getOwnItem(actor, id);
    return this.supportHistoryRepo.findByFeedback(fb.id);
  }

  // Records a stage entry and emails the end user about it — every IT-tier
  // stage change keeps the submitter informed, mirroring the product flow.
  // `note` is optional, supporter-written context folded into that same email.
  private recordStage(
    fb: Feedback,
    status: string,
    enteredAt: Date,
    context: { companyName: string; projectName: string; organizationId?: string | null },
    note?: string
  ) {
    this.supportHistoryRepo
      .create({ feedbackId: fb.id, status, enteredAt })
      .catch((e: Error) => console.error("[support] history entry failed:", e.message));

    const copy = SUPPORT_EMAIL_COPY[status];
    if (copy) {
      sendSupportStatusEmail(
        fb.submitterEmail,
        fb.submitterName,
        context.companyName,
        context.projectName,
        ticketLabel(fb),
        SUPPORT_STATUS_LABELS[status] ?? status,
        copy,
        note ?? null,
        context.organizationId ?? null
      ).catch((e: Error) => console.error("[support] status email failed:", e.message));
    }
  }

  // Advance the item one working stage (logged → acknowledged → investigating).
  // Resolved/escalated are reached via resolveLocally/escalate, never here.
  // `note` is optional — when given, it's emailed to the submitter alongside
  // the stage-change copy and kept as the item's latest supporter note.
  async updateStatus(actor: Actor, id: string, nextStatus: string, note?: string) {
    const fb = await this.getAssignedItem(actor, id);
    if (!SUPPORT_PROGRESSION.includes(nextStatus)) {
      throw new AppError("Use the resolve or escalate actions for final stages", 422);
    }
    assertValidSupportTransition(fb.supportStatus as string, nextStatus);
    if (fb.supportStatus === nextStatus) return fb;

    const enteredAt = new Date();
    const trimmedNote = note?.trim() || undefined;
    const updated = await this.feedbackRepo.update(fb.id, {
      supportStatus: nextStatus,
      ...(trimmedNote ? { supportResponse: trimmedNote } : {}),
    });

    const [project, company] = await Promise.all([
      this.projectRepo.findById(fb.projectId),
      this.companyRepo.findById(fb.clientCompanyId as string),
    ]);
    this.recordStage(
      fb,
      nextStatus,
      enteredAt,
      {
        companyName: company?.name ?? "your company",
        projectName: project?.name ?? "",
        organizationId: project?.organizationId ?? null,
      },
      trimmedNote
    );

    ActivityService.Instance.log(actor, {
      action: "feedback.support_status_changed",
      summary: `IT support moved "${fb.title}" to ${nextStatus} for "${company?.name}"`,
      entityType: "feedback",
      entityId: fb.id,
      clientCompanyId: fb.clientCompanyId,
      metadata: { projectId: fb.projectId, clientCompanyId: fb.clientCompanyId },
    });

    return updated;
  }

  // Final stages can only be reached from "investigating" — the workflow is
  // strictly ordered, like the product team's.
  private assertReadyForOutcome(fb: Feedback, verb: string): void {
    if (fb.supportStatus === SupportStatus.INVESTIGATING) return;
    if (
      fb.supportStatus === SupportStatus.AWAITING_CONFIRMATION ||
      fb.supportStatus === SupportStatus.RESOLVED ||
      fb.supportStatus === SupportStatus.ESCALATED
    ) {
      throw new AppError(
        `This item is already ${SUPPORT_STATUS_LABELS[fb.supportStatus as string]?.toLowerCase()}`,
        409
      );
    }
    throw new AppError(
      `Move the item to "Under investigation" before you ${verb} it — stages advance in order.`,
      422
    );
  }

  // Resolve without involving the product team. The note is required — it's
  // the supporter's answer to the end user, sent by email along with a
  // confirm/reopen link. RESOLVED only becomes final once the submitter
  // confirms via submitConfirmation below — until then this sits at
  // AWAITING_CONFIRMATION.
  async resolveLocally(actor: Actor, id: string, note: string) {
    const fb = await this.getAssignedItem(actor, id);
    this.assertReadyForOutcome(fb, "resolve");

    const enteredAt = new Date();
    const updated = await this.feedbackRepo.update(fb.id, {
      supportStatus: SupportStatus.AWAITING_CONFIRMATION,
      supportResponse: note,
    });

    const [project, company] = await Promise.all([
      this.projectRepo.findById(fb.projectId),
      this.companyRepo.findById(fb.clientCompanyId as string),
    ]);

    // The resolution email (with the note) IS the "resolved" stage email —
    // record the stage without the generic copy to avoid double-emailing.
    this.supportHistoryRepo
      .create({ feedbackId: fb.id, status: SupportStatus.AWAITING_CONFIRMATION, enteredAt })
      .catch((e: Error) => console.error("[support] history entry failed:", e.message));

    // Same public confirmation page the product tier uses, keyed by feedback
    // id — FeedbackService.submitConfirmation dispatches here for this item.
    const confirmUrl = `${env.appUrl}/feedback/${fb.id}/confirm`;
    sendSupportResolutionEmail(
      fb.submitterEmail,
      fb.submitterName,
      company?.name ?? "your company",
      project?.name ?? "",
      ticketLabel(fb),
      note,
      confirmUrl,
      project?.organizationId ?? null
    ).catch((e: Error) => console.error("[support] resolution email failed:", e.message));

    ActivityService.Instance.log(actor, {
      action: "feedback.support_resolved",
      summary: `IT support marked "${fb.title}" resolved for "${company?.name}" — awaiting the submitter's confirmation`,
      entityType: "feedback",
      entityId: fb.id,
      clientCompanyId: fb.clientCompanyId,
      metadata: { projectId: fb.projectId, clientCompanyId: fb.clientCompanyId },
    });

    return updated;
  }

  // Whoever's actively handling this item right now — the assigned supporter
  // if there is one, else every one of the company's leads — so a submitter's
  // reopen never goes unnoticed.
  private async resolveActiveHandlers(fb: Feedback): Promise<any[]> {
    if (fb.assignedSupporterId) {
      const supporter = await this.userRepo.findById(fb.assignedSupporterId);
      return supporter ? [supporter] : [];
    }
    const supporters = await this.userRepo.findByClientCompany(fb.clientCompanyId as string);
    return supporters.filter((s: any) => s.isSupportLead);
  }

  // The submitter's verdict via the confirm/reopen link on the resolution
  // email — confirmed makes RESOLVED final, not confirmed reopens it to
  // "investigating" for another pass. Public/unauthenticated: dispatched here
  // from FeedbackService.submitConfirmation for any pre-escalation
  // company-routed item (mirrors the product tier's own confirm flow).
  async submitConfirmation(id: string, confirmed: boolean, reason?: string) {
    const fb = await this.feedbackRepo.findById(id);
    if (!fb || fb.deletedAt) throw new AppError("This feedback link is no longer valid", 404);
    if (fb.supportStatus !== SupportStatus.AWAITING_CONFIRMATION) {
      throw new AppError("This feedback has already been handled", 409);
    }

    const enteredAt = new Date();
    const newStatus = confirmed ? SupportStatus.RESOLVED : SupportStatus.INVESTIGATING;
    // Only relevant on a reopen — cleared once it's confirmed resolved.
    const reopenReason = confirmed ? null : reason?.trim() || null;

    const updated = await this.feedbackRepo.update(fb.id, {
      supportStatus: newStatus,
      reopenReason,
      ...(confirmed ? { supportResolvedAt: enteredAt } : {}),
    });

    this.supportHistoryRepo
      .create({ feedbackId: fb.id, status: newStatus, enteredAt })
      .catch((e: Error) => console.error("[support] history entry failed:", e.message));

    const [project, company] = await Promise.all([
      this.projectRepo.findById(fb.projectId),
      this.companyRepo.findById(fb.clientCompanyId as string),
    ]);

    ActivityService.Instance.log(
      { id: null, organizationId: project?.organizationId ?? null },
      {
        action: "feedback.support_confirmed",
        summary: confirmed
          ? `Submitter confirmed "${fb.title}" resolved for "${company?.name}" — closed`
          : `Submitter reopened "${fb.title}" for "${company?.name}" — back to investigating${reopenReason ? `: "${reopenReason}"` : ""}`,
        entityType: "feedback",
        entityId: fb.id,
        clientCompanyId: fb.clientCompanyId,
        metadata: { projectId: fb.projectId, clientCompanyId: fb.clientCompanyId },
      }
    );

    sendFeedbackConfirmationReceivedEmail(
      fb.submitterEmail,
      fb.submitterName,
      project?.name ?? "",
      ticketLabel(fb),
      confirmed,
      project?.organizationId ?? null
    ).catch((e: Error) => console.error("[support] confirmation-received email failed:", e.message));

    this.resolveActiveHandlers(fb)
      .then((recipients) => {
        if (!recipients.length) return;
        return this.notificationService.notifyFeedbackConfirmed(recipients, {
          feedbackId: fb.id,
          projectId: fb.projectId,
          projectName: project?.name ?? "",
          title: ticketLabel(fb),
          confirmed,
          reopenReason,
        });
      })
      .catch((e: Error) => console.error("[support] confirmation notify failed:", e.message));

    return updated;
  }

  // Hand the item to the product owner's team. From here it enters the normal
  // triage workflow at "logged" and becomes visible to the product org.
  async escalate(actor: Actor, id: string, severity: string, note?: string) {
    const fb = await this.getAssignedItem(actor, id);
    this.assertReadyForOutcome(fb, "escalate");

    const escalatedAt = new Date();
    const updated = await this.feedbackRepo.update(fb.id, {
      supportStatus: SupportStatus.ESCALATED,
      supportResponse: note?.trim() || null,
      escalatedAt,
      escalatedById: actor.id,
      severity,
    });

    // The product owner's timeline starts now — not when the end user first
    // submitted — so IT-queue dwell time never counts against the product team.
    this.historyRepo
      .create({ feedbackId: fb.id, status: FeedbackStatus.LOGGED, enteredAt: escalatedAt })
      .catch((e: Error) => console.error("[support] history entry failed:", e.message));

    const [project, company, supporter] = await Promise.all([
      this.projectRepo.findById(fb.projectId),
      this.companyRepo.findById(fb.clientCompanyId as string),
      this.authRepo.findUserById(actor.id),
    ]);
    const escalatedByName = supporter
      ? [supporter.firstName, supporter.lastName].filter(Boolean).join(" ")
      : "IT support";

    // IT-tier timeline entry + "escalated to the product team" email to the
    // end user — the last update they get directly; IT relays from here on.
    this.recordStage(fb, SupportStatus.ESCALATED, escalatedAt, {
      companyName: company?.name ?? "your company",
      projectName: project?.name ?? "",
      organizationId: project?.organizationId ?? null,
    });

    ActivityService.Instance.log(actor, {
      action: "feedback.escalated",
      summary: `IT support at "${company?.name}" escalated "${fb.title}" on "${project?.name}"`,
      entityType: "feedback",
      entityId: fb.id,
      clientCompanyId: fb.clientCompanyId,
      metadata: { projectId: fb.projectId, clientCompanyId: fb.clientCompanyId },
    });

    // Same recipient fan-out as a direct public submission: org admins +
    // project members, deduped. Company-operational data, so superadmins are
    // excluded. Fire-and-forget.
    Promise.all([
      project?.organizationId
        ? this.authRepo.findByRoleAndOrg(UserRole.ADMIN, project.organizationId)
        : Promise.resolve([]),
      this.memberRepo.findMemberUsers(fb.projectId),
    ])
      .then(([orgAdmins, members]: any[]) => {
        const recipients = [
          ...new Map(
            [...orgAdmins, ...members].map((u: any) => [u.id, u])
          ).values(),
        ];
        if (recipients.length) {
          return this.notificationService.notifyFeedbackEscalated(recipients, {
            feedbackId: fb.id,
            projectId: fb.projectId,
            projectName: project?.name ?? "",
            companyName: company?.name ?? "",
            title: ticketLabel(fb),
            type: fb.type,
            escalatedByName,
            severity,
            note: note?.trim() || null,
            organizationId: project?.organizationId ?? null,
          });
        }
      })
      .catch((e: Error) => console.error("[support] escalation notify failed:", e.message));

    return updated;
  }

  // A lead routes a queue item to a teammate — independent of its working
  // stage, so incoming items can be distributed as soon as they land. Pass
  // supporterId: null to unassign.
  async assignToSupporter(actor: Actor, id: string, supporterId: string | null) {
    if (!actor.isSupportLead) {
      throw new AppError("Only IT support leads can assign queue items", 403);
    }
    const fb = await this.getOwnItem(actor, id);

    let supporter: any = null;
    if (supporterId) {
      supporter = await this.userRepo.findById(supporterId);
      if (
        !supporter ||
        supporter.deletedAt ||
        supporter.role !== UserRole.IT_SUPPORT ||
        supporter.clientCompanyId !== fb.clientCompanyId
      ) {
        throw new AppError("Supporter not found in this company", 404);
      }
    }

    const updated = await this.feedbackRepo.update(fb.id, { assignedSupporterId: supporterId });

    const [project, company, assignedBy] = await Promise.all([
      this.projectRepo.findById(fb.projectId),
      this.companyRepo.findById(fb.clientCompanyId as string),
      this.authRepo.findUserById(actor.id),
    ]);
    const assignedByName = assignedBy
      ? [assignedBy.firstName, assignedBy.lastName].filter(Boolean).join(" ")
      : "Your team lead";

    ActivityService.Instance.log(actor, {
      action: "feedback.support_assigned",
      summary: supporter
        ? `Assigned "${fb.title}" to ${supporter.firstName} ${supporter.lastName} for "${company?.name}"`
        : `Unassigned "${fb.title}" for "${company?.name}"`,
      entityType: "feedback",
      entityId: fb.id,
      clientCompanyId: fb.clientCompanyId,
      metadata: { projectId: fb.projectId, clientCompanyId: fb.clientCompanyId, supporterId },
    });

    if (supporter) {
      this.notificationService
        .notifySupportItemAssigned(supporter, {
          feedbackId: fb.id,
          projectId: fb.projectId,
          projectName: project?.name ?? "",
          companyName: company?.name ?? "",
          title: ticketLabel(fb),
          assignedByName,
          organizationId: project?.organizationId ?? null,
        })
        .catch((e: Error) => console.error("[support] assignment notify failed:", e.message));
    }

    return updated;
  }

  // Relays a fix to the true end user after the product team closes an
  // escalated item — deliberate, not automatic, since the submitter never
  // sees product-team stage emails once escalated (the supporter is the
  // contact for those instead). Can only be done once.
  async notifySubmitterFixed(actor: Actor, id: string, note: string) {
    const fb = await this.getAssignedItem(actor, id);
    if (fb.supportStatus !== SupportStatus.ESCALATED) {
      throw new AppError("Only escalated items can be relayed to the submitter this way", 422);
    }
    if (fb.status !== FeedbackStatus.CLOSED) {
      throw new AppError("Wait for the product team to close this before notifying your user", 422);
    }
    if (fb.submitterNotifiedAt) {
      throw new AppError("The submitter has already been notified", 409);
    }

    // Persisted as the item's latest note too — once relayed, this is the
    // note that's actually safe to show the true submitter (the internal
    // escalation note that may have preceded it never went to them).
    const updated = await this.feedbackRepo.update(fb.id, {
      submitterNotifiedAt: new Date(),
      supportResponse: note,
    });

    const [project, company] = await Promise.all([
      this.projectRepo.findById(fb.projectId),
      this.companyRepo.findById(fb.clientCompanyId as string),
    ]);

    // No confirm link here — this is a one-way relay of the product team's
    // fix, not a fresh IT-tier resolution awaiting the submitter's verdict.
    sendSupportResolutionEmail(
      fb.submitterEmail,
      fb.submitterName,
      company?.name ?? "your company",
      project?.name ?? "",
      ticketLabel(fb),
      note,
      null,
      project?.organizationId ?? null
    ).catch((e: Error) => console.error("[support] submitter-notify email failed:", e.message));

    ActivityService.Instance.log(actor, {
      action: "feedback.support_submitter_notified",
      summary: `IT support told the submitter "${fb.title}" is fixed`,
      entityType: "feedback",
      entityId: fb.id,
      clientCompanyId: fb.clientCompanyId,
      metadata: { projectId: fb.projectId },
    });

    return updated;
  }

  // Called by FeedbackService.submitPublic when a company-token submission
  // arrives — alerts the company's supporters instead of the product org.
  async notifyQueueItem(
    company: { id: string; name: string },
    fb: Feedback,
    project: { id: string; name: string; organizationId?: string | null }
  ) {
    const supporters = await this.userRepo.findByClientCompany(company.id);
    if (!supporters.length) return;
    await this.notificationService.notifySupportQueueItem(supporters, {
      feedbackId: fb.id,
      projectId: project.id,
      projectName: project.name,
      companyName: company.name,
      title: ticketLabel(fb),
      type: fb.type,
      submitterName: fb.submitterName,
      organizationId: project.organizationId ?? null,
    });
  }
}
