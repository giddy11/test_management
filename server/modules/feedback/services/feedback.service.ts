// modules/feedback/services/feedback.service.ts
// External feedback: submitted unauthenticated through a project's public form
// (looked up by projects.feedback_token), then triaged in TestMate. The
// submitter is emailed at every lifecycle stage.
import { randomUUID } from "crypto";
import { FeedbackRepository } from "../repositories/feedback.repository";
import { FeedbackStatusHistoryRepository } from "../repositories/feedbackStatusHistory.repository";
import { FeedbackSupportStatusHistoryRepository } from "../repositories/feedbackSupportStatusHistory.repository";
import { ProjectRepository } from "../../project/repositories/project.repository";
import { ProjectMemberRepository } from "../../project/repositories/projectMember.repository";
import { ProjectService } from "../../project/services/project.service";
import { ClientCompanyRepository } from "../../clientCompany/repositories/clientCompany.repository";
import type { Actor } from "../../../shared/types/actor";
import type { Feedback } from "../entities/feedback.entity";

const { AuthRepository } = require("../../auth/repositories/auth.repository");
const { NotificationService } = require("../../notification/services/notification.service");
const { ActivityService } = require("../../activity/services/activity.service");
const { StorageService } = require("../../../shared/services/storage.service");
const {
  TestSuiteRepository,
} = require("../../testSuite/repositories/testSuite.repository");
const {
  sendFeedbackReceivedEmail,
  sendFeedbackStatusEmail,
  sendFeedbackConfirmationReceivedEmail,
} = require("../../../shared/utils/mailer");
const { AppError } = require("../../../shared/errors/AppError");
const { UserRole, FeedbackStatus, SupportStatus } = require("../../../config/constants");
const { env } = require("../../../config/env");

// The lifecycle is strictly ordered — Object.freeze preserves declaration order.
const FEEDBACK_STATUS_ORDER: string[] = Object.values(FeedbackStatus);

const FEEDBACK_STATUS_LABELS: Record<string, string> = {
  [FeedbackStatus.LOGGED]: "Logged",
  [FeedbackStatus.ACKNOWLEDGED]: "Acknowledged",
  [FeedbackStatus.ASSIGNED]: "Assigned",
  [FeedbackStatus.INVESTIGATING]: "Investigating",
  [FeedbackStatus.RESOLVED]: "Resolved",
  [FeedbackStatus.AWAITING_CONFIRMATION]: "Awaiting confirmation",
  [FeedbackStatus.CLOSED]: "Closed",
};

// Only the current stage or the very next one may be selected — a submission
// can't jump ahead (or move backward) in the support workflow.
function assertValidStatusTransition(current: string, next: string): void {
  if (current === next) return;
  const from = FEEDBACK_STATUS_ORDER.indexOf(current);
  const to = FEEDBACK_STATUS_ORDER.indexOf(next);
  if (to !== from + 1) {
    const expected = FEEDBACK_STATUS_ORDER[from + 1];
    const message = expected
      ? `Feedback must move through the workflow in order — the next stage from "${FEEDBACK_STATUS_LABELS[current]}" is "${FEEDBACK_STATUS_LABELS[expected]}".`
      : `Feedback is already at the final stage ("${FEEDBACK_STATUS_LABELS[current]}").`;
    throw new AppError(message, 422);
  }
}

// Copy for the submitter's stage emails. Keys = FeedbackStatus values.
const STATUS_EMAIL_COPY: Record<string, string> = {
  [FeedbackStatus.ACKNOWLEDGED]:
    "Your feedback has been acknowledged by the team and is in their queue.",
  [FeedbackStatus.ASSIGNED]:
    "Your feedback has been assigned to a team member who will work on it.",
  [FeedbackStatus.INVESTIGATING]: "The team is actively investigating your feedback.",
  [FeedbackStatus.RESOLVED]:
    "Your feedback has been resolved. You'll be asked to confirm the resolution shortly.",
  [FeedbackStatus.AWAITING_CONFIRMATION]:
    "The team believes this is resolved. Please confirm using the button below — you can also let us know if it isn't fixed yet.",
  [FeedbackStatus.CLOSED]: "Your feedback has been closed. Thank you for helping us improve!",
};

export class FeedbackService {
  static Instance = new FeedbackService();

  feedbackRepo: FeedbackRepository;
  historyRepo: FeedbackStatusHistoryRepository;
  projectRepo: any;
  projectService: any;
  memberRepo: ProjectMemberRepository;
  authRepo: any;
  notificationService: any;

  constructor(
    feedbackRepo = FeedbackRepository.Instance,
    historyRepo = FeedbackStatusHistoryRepository.Instance,
    projectRepo = ProjectRepository.Instance,
    projectService = ProjectService.Instance,
    memberRepo = ProjectMemberRepository.Instance,
    authRepo = AuthRepository.Instance,
    notificationService = NotificationService.Instance
  ) {
    this.feedbackRepo = feedbackRepo;
    this.historyRepo = historyRepo;
    this.projectRepo = projectRepo;
    this.projectService = projectService;
    this.memberRepo = memberRepo;
    this.authRepo = authRepo;
    this.notificationService = notificationService;
  }

  // ── Public form (unauthenticated) ───────────────────────────────────────────

  // A form token belongs either to the project itself (direct feedback to the
  // product team) or to one of its client companies (feedback routed to that
  // company's IT support queue first).
  private async resolveFormToken(token: string) {
    const project = await this.projectRepo.findByFeedbackToken(token);
    if (project) return { project, company: null as { id: string; name: string } | null };
    const company = await ClientCompanyRepository.Instance.findByFeedbackToken(token);
    if (company && !company.deletedAt) {
      const companyProject = await this.projectRepo.findById(company.projectId);
      if (companyProject && !companyProject.deletedAt) {
        return { project: companyProject, company };
      }
    }
    throw new AppError("This feedback form is not available", 404);
  }

  // The form page shows which product the feedback is for, and its suites so
  // the submitter can (optionally) point at the module their feedback concerns.
  async getPublicForm(token: string) {
    const { project, company } = await this.resolveFormToken(token);
    const suites = await TestSuiteRepository.Instance.findAllByProject(project.id);
    return {
      projectName: project.name,
      // Present for company-token forms — the page can show who'll triage it.
      clientCompanyName: company?.name ?? null,
      suites: suites.map((s: { id: string; name: string }) => ({ id: s.id, name: s.name })),
    };
  }

  async submitPublic(
    token: string,
    data: {
      type: string;
      title: string;
      description: string;
      suiteName?: string;
      submitterName: string;
      submitterEmail: string;
      submitterPhone?: string;
    },
    imageBuffers: Buffer[] = []
  ) {
    const { project, company } = await this.resolveFormToken(token);

    const fb = await this.feedbackRepo.create({
      projectId: project.id,
      // Company-token submissions start in the company's IT queue — invisible
      // to the product org until escalated.
      clientCompanyId: company?.id ?? null,
      supportStatus: company ? SupportStatus.LOGGED : null,
      type: data.type,
      title: data.title,
      description: data.description,
      suiteName: data.suiteName ?? null,
      submitterName: data.submitterName,
      submitterEmail: data.submitterEmail,
      submitterPhone: data.submitterPhone ?? null,
      status: FeedbackStatus.LOGGED,
    });

    // The product owner's stage timeline starts at submission for direct items,
    // but only at escalation for company items (see FeedbackSupportService).
    // Company items get their own IT-tier timeline, starting at "logged".
    if (!company) {
      this.historyRepo
        .create({ feedbackId: fb.id, status: FeedbackStatus.LOGGED, enteredAt: fb.createdAt })
        .catch((e: Error) => console.error("[feedback] history entry failed:", e.message));
    } else {
      FeedbackSupportStatusHistoryRepository.Instance.create({
        feedbackId: fb.id,
        status: SupportStatus.LOGGED,
        enteredAt: fb.createdAt,
      }).catch((e: Error) =>
        console.error("[feedback] support history entry failed:", e.message)
      );
    }

    // Screenshots (optional) — uploaded before the response so a submitter
    // never sees "success" while their images silently failed.
    if (imageBuffers.length > 0) {
      const uploads = await Promise.all(
        imageBuffers.map((buf) =>
          StorageService.Instance.uploadImage(buf, { folder: "testmate/feedback" })
        )
      );
      await this.feedbackRepo.addAttachments(
        fb.id,
        uploads.map((u: { url: string; publicId: string }) => ({
          url: u.url,
          publicId: u.publicId,
        }))
      );
    }

    // Confirmation to the (external) submitter — fire-and-forget.
    sendFeedbackReceivedEmail(
      fb.submitterEmail,
      fb.submitterName,
      project.name,
      fb.title,
      project.organizationId
    ).catch((e: Error) => console.error("[feedback] received email failed:", e.message));

    if (company) {
      // Company-token submission: alert that company's IT supporters only —
      // the product org hears about it if/when IT support escalates.
      const { FeedbackSupportService } = require("./feedbackSupport.service");
      FeedbackSupportService.Instance.notifyQueueItem(company, fb, project).catch((e: Error) =>
        console.error("[feedback] support-queue notify failed:", e.message)
      );
      return { id: fb.id };
    }

    // Alert the project's admins + members in-app and by email.
    Promise.all([
      this.authRepo.findByRole(UserRole.SUPERADMIN),
      project.organizationId
        ? this.authRepo.findByRoleAndOrg(UserRole.ADMIN, project.organizationId)
        : Promise.resolve([]),
      this.memberRepo.findMemberUsers(project.id),
    ])
      .then(([superadmins, orgAdmins, members]: any[]) => {
        const recipients = [
          ...new Map(
            [...superadmins, ...orgAdmins, ...members].map((u: any) => [u.id, u])
          ).values(),
        ];
        if (recipients.length) {
          return this.notificationService.notifyNewFeedback(recipients, {
            feedbackId: fb.id,
            projectId: project.id,
            projectName: project.name,
            title: fb.title,
            type: fb.type,
            submitterName: fb.submitterName,
            organizationId: project.organizationId,
          });
        }
      })
      .catch((e: Error) => console.error("[feedback] new-feedback notify failed:", e.message));

    return { id: fb.id };
  }

  // ── Authenticated (project members/admins) ──────────────────────────────────

  async fetchFeedback(actor: Actor, params: { projectId?: string } & Record<string, unknown>) {
    // Supporters have their own queue endpoints — the triage list is the
    // product org's view.
    if (actor.role === UserRole.IT_SUPPORT) {
      throw new AppError("IT supporters use the support queue", 403);
    }

    if (params.projectId) {
      await this.projectService.getProject(actor, params.projectId);
      return this.feedbackRepo.fetchPaginated(params as any);
    }

    // Cross-project view: superadmin sees all orgs, admins their org, plain
    // users only projects they're members of.
    if (actor.role === UserRole.SUPERADMIN) {
      return this.feedbackRepo.fetchPaginated(params as any);
    }
    if (actor.role === UserRole.ADMIN) {
      return this.feedbackRepo.fetchPaginated({
        ...params,
        organizationId: actor.organizationId ?? undefined,
      } as any);
    }
    return this.feedbackRepo.fetchPaginated({ ...params, restrictedUserId: actor.id } as any);
  }

  // Items still sitting in (or resolved by) a client company's IT queue don't
  // exist as far as the product org is concerned.
  private assertVisibleToOrg(fb: Feedback | null): asserts fb is Feedback {
    if (!fb || fb.deletedAt) throw new AppError("Feedback not found", 404);
    if (fb.clientCompanyId && fb.supportStatus !== SupportStatus.ESCALATED) {
      throw new AppError("Feedback not found", 404);
    }
  }

  // Post-escalation, the escalating IT supporter is the contact for all
  // lifecycle emails (they relay to their end users). Direct submissions keep
  // emailing the original submitter.
  private async resolveEmailRecipient(fb: Feedback): Promise<{ email: string; name: string }> {
    if (fb.escalatedById) {
      const supporter =
        fb.escalatedBy ?? (await this.authRepo.findUserById(fb.escalatedById));
      if (supporter) {
        return {
          email: supporter.email,
          name: [supporter.firstName, supporter.lastName].filter(Boolean).join(" "),
        };
      }
    }
    return { email: fb.submitterEmail, name: fb.submitterName };
  }

  async manageFeedback(
    actor: Actor,
    id: string,
    data: { status?: string; assignedToIds?: string[]; adminResponse?: string | null }
  ) {
    const fb = await this.feedbackRepo.findById(id);
    this.assertVisibleToOrg(fb);
    const project = await this.projectService.getProject(actor, fb.projectId);

    // Admins/superadmins and the project's team lead can do anything here.
    // An assignee who isn't a manager can still drive the item's status
    // (and leave a note) all the way through to closed — they just can't
    // reassign it to someone else, which stays a management decision.
    const canManage = await this.projectService.canManageProject(actor, fb.projectId);
    const isAssignee = (fb.assignees ?? []).some((u) => u.id === actor.id);
    if (!canManage && !isAssignee) {
      throw new AppError("Only admins, this project's team lead, or an assignee can do this", 403);
    }
    if (!canManage && data.assignedToIds !== undefined) {
      throw new AppError("Only admins or this project's team lead can reassign feedback", 403);
    }

    const patch: Record<string, unknown> = {};
    if (data.adminResponse !== undefined) patch.adminResponse = data.adminResponse;

    // Newly-assigned users get notified once the update is persisted.
    let newlyAssignedUsers: { id: string; email: string; firstName: string; lastName: string | null }[] = [];
    if (data.assignedToIds !== undefined) {
      const uniqueIds = [...new Set(data.assignedToIds)];
      // Restricted to this project's members — nobody outside the project can be assigned.
      const projectMembers = await this.memberRepo.findMemberUsers(fb.projectId);
      const memberMap = new Map(projectMembers.map((m) => [m.id, m]));
      const users: typeof projectMembers = [];
      for (const uid of uniqueIds) {
        const member = memberMap.get(uid);
        if (!member) throw new AppError("You can only assign members of this project", 422);
        users.push(member);
      }

      const before = new Set((fb.assignees ?? []).map((u) => u.id));
      await this.feedbackRepo.setAssignees(fb, users.map((u) => ({ id: u.id })));
      newlyAssignedUsers = users.filter((u) => !before.has(u.id));

      // Assigning implicitly moves logged/acknowledged feedback forward.
      if (uniqueIds.length > 0 && data.status === undefined && (fb.status === FeedbackStatus.LOGGED || fb.status === FeedbackStatus.ACKNOWLEDGED)) {
        patch.status = FeedbackStatus.ASSIGNED;
      }
    }
    if (data.status !== undefined) {
      assertValidStatusTransition(fb.status, data.status);
      patch.status = data.status;
    }
    if (patch.status && patch.status !== fb.status) {
      patch.statusUpdatedAt = new Date();
    }

    const updated = Object.keys(patch).length > 0 ? await this.feedbackRepo.update(fb.id, patch as any) : await this.feedbackRepo.findById(fb.id);

    // One history row per stage entered — powers the duration-per-stage timeline.
    if (patch.status && patch.status !== fb.status) {
      this.historyRepo
        .create({ feedbackId: fb.id, status: patch.status as string, enteredAt: patch.statusUpdatedAt as Date })
        .catch((e: Error) => console.error("[feedback] history entry failed:", e.message));
    }

    ActivityService.Instance.log(actor, {
      action: "feedback.updated",
      summary: `Updated feedback "${fb.title}" to ${updated?.status} in project "${project.name}"`,
      entityType: "feedback",
      entityId: fb.id,
      metadata: { projectId: fb.projectId },
    });

    // Closing an escalated item is handled separately below (notifies the
    // supporter, not the generic "your feedback is now X" copy) — everything
    // else emails the external contact about the stage change as usual: the
    // original submitter for direct items, the escalating IT supporter for
    // escalated ones (mid-workflow stages still reach the supporter this way).
    const isEscalatedClose =
      patch.status === FeedbackStatus.CLOSED && Boolean(fb.escalatedById);
    if (updated && patch.status && patch.status !== fb.status && !isEscalatedClose) {
      const copy = STATUS_EMAIL_COPY[updated.status];
      if (copy) {
        const recipient = await this.resolveEmailRecipient(fb);
        sendFeedbackStatusEmail(
          recipient.email,
          recipient.name,
          project.name,
          fb.title,
          updated.status,
          copy,
          updated.adminResponse ?? null,
          `${env.appUrl}/feedback/${fb.id}/confirm`,
          project.organizationId
        ).catch((e: Error) => console.error("[feedback] status email failed:", e.message));
      }
    }

    // An escalated item was just closed — the escalating supporter is
    // notified (in-app + email) since they're the one who has to relay the
    // fix to their end user; the end user never sees this transition directly.
    if (updated && isEscalatedClose && patch.status !== fb.status) {
      const supporter =
        fb.escalatedBy ?? (await this.authRepo.findUserById(fb.escalatedById));
      this.notificationService
        .notifyFeedbackClosedForSupporter(supporter, {
          feedbackId: fb.id,
          projectId: fb.projectId,
          projectName: project.name,
          companyName: fb.clientCompany?.name ?? "your company",
          title: fb.title,
          adminResponse: updated.adminResponse ?? null,
          organizationId: project.organizationId,
        })
        .catch((e: Error) => console.error("[feedback] closed-supporter notify failed:", e.message));
    }

    // Notify newly-assigned users (in-app + email), fire-and-forget. The actor
    // is excluded — nobody is notified about their own action.
    const notifyUsers = newlyAssignedUsers.filter((u) => u.id !== actor.id);
    if (notifyUsers.length) {
      const me = await this.authRepo.findUserById(actor.id);
      const assignedByName = me
        ? [me.firstName, me.lastName].filter(Boolean).join(" ")
        : "An admin";
      this.notificationService.notifyFeedbackAssigned(notifyUsers, {
        feedbackId: fb.id,
        projectId: fb.projectId,
        projectName: project.name,
        title: fb.title,
        assignedByName,
        organizationId: project.organizationId,
      }).catch((e: Error) => console.error("[feedback] assignment notify failed:", e.message));
    }

    return updated;
  }

  // Only admins/superadmins and the project's team lead can delete — the same
  // bar as reassignment, since removing an item is a management decision.
  async deleteFeedback(actor: Actor, id: string): Promise<void> {
    const fb = await this.feedbackRepo.findById(id);
    this.assertVisibleToOrg(fb);
    const project = await this.projectService.getProject(actor, fb.projectId);
    await this.projectService.assertCanManageProject(actor, fb.projectId);

    await this.feedbackRepo.softDelete(fb.id);

    ActivityService.Instance.log(actor, {
      action: "feedback.deleted",
      summary: `Deleted feedback "${fb.title}" in project "${project.name}"`,
      entityType: "feedback",
      entityId: fb.id,
      metadata: { projectId: fb.projectId },
    });
  }

  // Ordered stage-entry timestamps — the caller (DTO) derives per-stage
  // durations from consecutive entries.
  async getFeedbackTimeline(actor: Actor, id: string) {
    const fb = await this.feedbackRepo.findById(id);
    this.assertVisibleToOrg(fb);
    await this.projectService.getProject(actor, fb.projectId);
    return this.historyRepo.findByFeedback(id);
  }

  // ── Confirmation link (public, unauthenticated — reached from the status email) ─

  // Read-only context for the confirmation page: what it's confirming, and
  // whether the link is still actionable (status may have already moved on).
  async getPublicConfirmationContext(id: string) {
    const fb = await this.feedbackRepo.findById(id);
    if (!fb || fb.deletedAt) throw new AppError("This feedback link is no longer valid", 404);
    const project = await this.projectRepo.findById(fb.projectId);
    // Company items link back to the company's form, direct items to the
    // project's — null if since disabled.
    const backLinkToken = fb.clientCompanyId
      ? fb.clientCompany?.feedbackToken ?? null
      : project?.feedbackToken ?? null;
    return {
      projectName: project?.name ?? "",
      title: fb.title,
      status: fb.status,
      feedbackToken: backLinkToken,
    };
  }

  // The submitter's verdict: confirmed → closed, not confirmed → reopened
  // (back to investigating). This is the one place the strictly-ordered
  // workflow moves backward — a deliberate exception for submitter-driven reopens.
  async submitConfirmation(id: string, confirmed: boolean, reason?: string) {
    const fb = await this.feedbackRepo.findById(id);
    if (!fb || fb.deletedAt) throw new AppError("This feedback link is no longer valid", 404);
    if (fb.status !== FeedbackStatus.AWAITING_CONFIRMATION) {
      throw new AppError("This feedback has already been handled", 409);
    }

    const project = await this.projectRepo.findById(fb.projectId);
    const newStatus = confirmed ? FeedbackStatus.CLOSED : FeedbackStatus.INVESTIGATING;
    const enteredAt = new Date();
    // Only relevant on a reopen — cleared once it's confirmed closed.
    const reopenReason = confirmed ? null : reason?.trim() || null;

    const updated = await this.feedbackRepo.update(fb.id, {
      status: newStatus,
      statusUpdatedAt: enteredAt,
      reopenReason,
    } as any);

    this.historyRepo
      .create({ feedbackId: fb.id, status: newStatus, enteredAt })
      .catch((e: Error) => console.error("[feedback] history entry failed:", e.message));

    ActivityService.Instance.log(
      { id: null, organizationId: project?.organizationId ?? null },
      {
        action: "feedback.confirmed",
        summary: confirmed
          ? `Submitter confirmed "${fb.title}" resolved in project "${project?.name}" — closed`
          : `Submitter reopened "${fb.title}" in project "${project?.name}" — back to investigating${reopenReason ? `: "${reopenReason}"` : ""}`,
        entityType: "feedback",
        entityId: fb.id,
        metadata: { projectId: fb.projectId },
      }
    );

    // Let the contact know their verdict was recorded — the escalating IT
    // supporter for escalated items, else the original submitter. Fire-and-forget.
    const recipient = await this.resolveEmailRecipient(fb);
    sendFeedbackConfirmationReceivedEmail(
      recipient.email,
      recipient.name,
      project?.name ?? "",
      fb.title,
      confirmed,
      project?.organizationId
    ).catch((e: Error) => console.error("[feedback] confirmation-received email failed:", e.message));

    // Alert the project's admins + members — same recipient fan-out as new feedback.
    Promise.all([
      this.authRepo.findByRole(UserRole.SUPERADMIN),
      project?.organizationId
        ? this.authRepo.findByRoleAndOrg(UserRole.ADMIN, project.organizationId)
        : Promise.resolve([]),
      this.memberRepo.findMemberUsers(fb.projectId),
    ])
      .then(([superadmins, orgAdmins, members]: any[]) => {
        const recipients = [
          ...new Map(
            [...superadmins, ...orgAdmins, ...members].map((u: any) => [u.id, u])
          ).values(),
        ];
        if (recipients.length) {
          return this.notificationService.notifyFeedbackConfirmed(recipients, {
            feedbackId: fb.id,
            projectId: fb.projectId,
            projectName: project?.name ?? "",
            title: fb.title,
            confirmed,
            reopenReason,
          });
        }
      })
      .catch((e: Error) => console.error("[feedback] confirmation notify failed:", e.message));

    return { status: updated?.status };
  }

  // ── Feedback-form link management (admin) ───────────────────────────────────

  async setFeedbackLink(actor: Actor, projectId: string, enabled: boolean) {
    const project = await this.projectService.getProject(actor, projectId);
    project.feedbackToken = enabled ? randomUUID() : null;
    await this.projectRepo.save(project);
    return { feedbackToken: project.feedbackToken };
  }
}
