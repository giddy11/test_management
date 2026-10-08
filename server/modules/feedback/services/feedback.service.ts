// modules/feedback/services/feedback.service.ts
// External feedback: submitted unauthenticated through a project's public form
// (looked up by projects.feedback_token), then triaged in TestMate. The
// submitter is emailed at every lifecycle stage.
import { randomUUID } from "crypto";
import { FeedbackRepository } from "../repositories/feedback.repository";
import { FeedbackStatusHistoryRepository } from "../repositories/feedbackStatusHistory.repository";
import { FeedbackSupportStatusHistoryRepository } from "../repositories/feedbackSupportStatusHistory.repository";
import { FeedbackLookupCodeRepository } from "../repositories/feedbackLookupCode.repository";
import { ProjectRepository } from "../../project/repositories/project.repository";
import { ProjectMemberRepository } from "../../project/repositories/projectMember.repository";
import { ProjectService } from "../../project/services/project.service";
import { ClientCompanyRepository } from "../../clientCompany/repositories/clientCompany.repository";
import {
  SubmitterTicketStatus,
  ticketCode,
  ticketLabel,
  toCompanyTicketResponse,
  toMyTicketResponse,
  toSubmitterStatus,
} from "../dto/feedback.dto";
import type { Actor } from "../../../shared/types/actor";
import type { Feedback } from "../entities/feedback.entity";
import type { Project } from "../../project/entities/project.entity";

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
  sendTicketLookupCodeEmail,
} = require("../../../shared/utils/mailer");
const { generateOtp, hashToken } = require("../../../shared/utils/password");
const { AppError } = require("../../../shared/errors/AppError");
const {
  isExternalSupporter,
  seesAllProjects,
} = require("../../../shared/access/scope");
const {
  UserRole,
  ProjectMemberRole,
  FeedbackStatus,
  FeedbackChannel,
  SupportStatus,
} = require("../../../config/constants");
const { env } = require("../../../config/env");

// The lifecycle is strictly ordered — Object.freeze preserves declaration order.
const FEEDBACK_STATUS_ORDER: string[] = Object.values(FeedbackStatus);

const FEEDBACK_STATUS_LABELS: Record<string, string> = {
  [FeedbackStatus.LOGGED]: "Logged",
  [FeedbackStatus.ACKNOWLEDGED]: "Acknowledged",
  [FeedbackStatus.ASSIGNED]: "Assigned",
  [FeedbackStatus.INVESTIGATING]: "Investigating",
  [FeedbackStatus.RESOLVED]: "Resolved",
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
    "Your feedback has been resolved — reply in the conversation below if it isn't fixed.",
  [FeedbackStatus.CLOSED]: "Your feedback has been closed. Thank you for helping us improve!",
};

export interface WhatsAppTicketInput {
  type: string;
  message: string;
  submitterName: string;
  submitterEmail: string;
  submitterPhone?: string | null;
  // The page the person was on when they wrote in — appended to the ticket's
  // description as context.
  pageUrl?: string | null;
}

// Fixed id of the auto-created "TestMate Support" project — see
// FeedbackService.resolveTestMateSupportProject.
const TESTMATE_SUPPORT_PROJECT_ID = "7e570a7e-5a99-4c0b-8d1e-5e1f0a2c3d4e";

// A WhatsApp-widget ticket has no separate subject field — its title is the
// message's first line, cut to fit.
const WHATSAPP_TITLE_MAX = 80;

function titleFromMessage(message: string): string {
  const firstLine = message.trim().split(/\r?\n/)[0].trim();
  return firstLine.length > WHATSAPP_TITLE_MAX
    ? `${firstLine.slice(0, WHATSAPP_TITLE_MAX - 1).trimEnd()}…`
    : firstLine;
}

// The full message, then any extra context (company, page) under a divider.
function whatsAppDescription(message: string, context: (string | null)[]): string {
  const extra = context.filter(Boolean);
  return extra.length ? `${message.trim()}\n\n---\n${extra.join("\n")}` : message.trim();
}

export class FeedbackService {
  static Instance = new FeedbackService();

  feedbackRepo: FeedbackRepository;
  historyRepo: FeedbackStatusHistoryRepository;
  projectRepo: any;
  projectService: any;
  memberRepo: ProjectMemberRepository;
  authRepo: any;
  notificationService: any;
  lookupCodeRepo: any;

  constructor(
    feedbackRepo = FeedbackRepository.Instance,
    historyRepo = FeedbackStatusHistoryRepository.Instance,
    projectRepo = ProjectRepository.Instance,
    projectService = ProjectService.Instance,
    memberRepo = ProjectMemberRepository.Instance,
    authRepo = AuthRepository.Instance,
    notificationService = NotificationService.Instance,
    lookupCodeRepo = FeedbackLookupCodeRepository.Instance
  ) {
    this.feedbackRepo = feedbackRepo;
    this.historyRepo = historyRepo;
    this.projectRepo = projectRepo;
    this.projectService = projectService;
    this.memberRepo = memberRepo;
    this.authRepo = authRepo;
    this.notificationService = notificationService;
    this.lookupCodeRepo = lookupCodeRepo;
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

  // Creates the row and its first history entry for a public-form or
  // WhatsApp-widget submission.
  private async createFeedbackCore(
    project: Project,
    data: {
      type: string;
      channel?: string;
      title: string;
      description: string;
      suiteName?: string | null;
      submitterName: string;
      submitterEmail: string;
      submitterPhone?: string | null;
      clientCompanyId?: string | null;
      supportStatus?: string | null;
    }
  ): Promise<Feedback> {
    const fb = await this.feedbackRepo.create({
      projectId: project.id,
      clientCompanyId: data.clientCompanyId ?? null,
      supportStatus: data.supportStatus ?? null,
      type: data.type,
      channel: data.channel ?? FeedbackChannel.WEB_FORM,
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
    if (!data.clientCompanyId) {
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

    return fb;
  }

  // Alert the project's admins + members in-app and by email — direct
  // (product-team-facing) submissions only, never company-routed ones (those
  // notify the company's IT supporters instead, see resolveFormToken callers).
  // This is company-operational data, so superadmins are deliberately excluded.
  private notifyProjectTeamOfNewFeedback(project: Project, fb: Feedback): void {
    Promise.all([
      project.organizationId
        ? this.authRepo.findByRoleAndOrg(UserRole.ADMIN, project.organizationId)
        : Promise.resolve([]),
      this.memberRepo.findMemberUsers(project.id),
    ])
      .then(([orgAdmins, members]: any[]) => {
        const recipients = [
          ...new Map(
            [...orgAdmins, ...members].map((u: any) => [u.id, u])
          ).values(),
        ];
        if (recipients.length) {
          return this.notificationService.notifyNewFeedback(recipients, {
            feedbackId: fb.id,
            projectId: project.id,
            projectName: project.name,
            title: ticketLabel(fb),
            type: fb.type,
            submitterName: fb.submitterName,
            organizationId: project.organizationId,
          });
        }
      })
      .catch((e: Error) => console.error("[feedback] new-feedback notify failed:", e.message));
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

    const fb = await this.createFeedbackCore(project, {
      ...data,
      clientCompanyId: company?.id ?? null,
      supportStatus: company ? SupportStatus.LOGGED : null,
    });

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
      ticketLabel(fb),
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

    this.notifyProjectTeamOfNewFeedback(project, fb);

    return { id: fb.id };
  }

  // ── WhatsApp widgets ────────────────────────────────────────────────────────
  // Both WhatsApp widgets (the embeddable one on a project's own site, and
  // TestMate's own in-app one) log a ticket the moment the person presses
  // send, just before handing them off to wa.me — so whatever follows on
  // WhatsApp already has a ticket here, a reference to quote, and the usual
  // "received" email. We never see whether the WhatsApp message itself goes
  // out; that happens in the person's own WhatsApp app. Always a direct,
  // product-team-facing ticket — neither widget belongs to a client company.
  async submitViaWhatsApp(
    project: Project,
    data: WhatsAppTicketInput,
    extraContext: string[] = []
  ): Promise<{ id: string; ticketCode: string }> {
    const fb = await this.createFeedbackCore(project, {
      type: data.type,
      channel: FeedbackChannel.WHATSAPP,
      title: titleFromMessage(data.message),
      description: whatsAppDescription(data.message, [
        ...extraContext,
        data.pageUrl ? `Sent from: ${data.pageUrl}` : null,
      ]),
      submitterName: data.submitterName,
      submitterEmail: data.submitterEmail,
      submitterPhone: data.submitterPhone ?? null,
    });

    sendFeedbackReceivedEmail(
      fb.submitterEmail,
      fb.submitterName,
      project.name,
      ticketLabel(fb),
      project.organizationId
    ).catch((e: Error) => console.error("[feedback] received email failed:", e.message));

    this.notifyProjectTeamOfNewFeedback(project, fb);

    return { id: fb.id, ticketCode: ticketCode(fb) };
  }

  // TestMate's own in-app widget: a signed-in user contacting TestMate itself
  // rather than one of their projects. Tickets land in the "TestMate Support"
  // project (see resolveTestMateSupportProject). Name, email and company come
  // from the account, never the request.
  async submitTestMateSupport(
    actor: Actor,
    data: { type: string; message: string; submitterPhone?: string; pageUrl?: string }
  ): Promise<{ id: string; ticketCode: string }> {
    const project = await this.resolveTestMateSupportProject();
    const user = await this.authRepo.findUserById(actor.id);
    if (!user) throw new AppError("User not found", 404);

    return this.submitViaWhatsApp(
      project,
      {
        type: data.type,
        message: data.message,
        submitterName: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
        submitterEmail: user.email,
        submitterPhone: data.submitterPhone ?? user.phoneNumber ?? null,
        pageUrl: data.pageUrl,
      },
      user.companyName ? [`Company: ${user.companyName}`] : []
    );
  }

  // The "TestMate Support" project — nothing to configure: created on the
  // first in-app ticket under a fixed id, owned and led by the platform's
  // superadmin, in their organisation. So TestMate's own team sees it in the
  // project list like any other project and is notified of new tickets the
  // usual way, while other organisations' admins never see it (projects are
  // org-scoped). If someone deletes it, the next ticket brings it back.
  private async resolveTestMateSupportProject(): Promise<Project> {
    const existing = await this.projectRepo.findById(TESTMATE_SUPPORT_PROJECT_ID);
    if (existing) return existing;

    const [owner] = await this.authRepo.findByRole(UserRole.SUPERADMIN);
    if (!owner) throw new AppError("Support tickets aren't available right now", 503);

    try {
      const project = await this.projectRepo.create({
        id: TESTMATE_SUPPORT_PROJECT_ID,
        name: "TestMate Support",
        description: "Tickets from TestMate's in-app WhatsApp support widget. Created automatically.",
        ownerId: owner.id,
        organizationId: owner.organizationId ?? null,
      });
      await this.memberRepo.setMembers(project.id, [
        { userId: owner.id, role: ProjectMemberRole.TEAM_LEAD },
      ]);
      return project;
    } catch {
      // The row exists already — a concurrent first ticket created it a moment
      // ago, or it was soft-deleted. Either way, bring it back and use it.
      await this.projectRepo.restore(TESTMATE_SUPPORT_PROJECT_ID);
      const project = await this.projectRepo.findById(TESTMATE_SUPPORT_PROJECT_ID);
      if (!project) throw new AppError("Support tickets aren't available right now", 503);
      return project;
    }
  }

  // A partner's own dashboard listing everything raised against its form —
  // same token as submitPublic, so no separate credential to manage. Reuses
  // fetchPaginated's existing clientCompanyId/projectId scoping (same query
  // the IT-support queue and admin triage list run), just through the
  // collapsed, submitter-safe DTO instead of the staff-facing one.
  async listPublicTickets(
    token: string,
    params: { page?: number; limit?: number; type?: string }
  ) {
    const { project, company } = await this.resolveFormToken(token);
    const result = await this.feedbackRepo.fetchPaginated({
      ...(company ? { clientCompanyId: company.id } : { projectId: project.id }),
      page: params.page,
      limit: params.limit,
      type: params.type,
    });
    return { data: result.data.map(toCompanyTicketResponse), meta: result.meta };
  }

  // ── Authenticated (project members/admins) ──────────────────────────────────

  async fetchFeedback(actor: Actor, params: { projectId?: string } & Record<string, unknown>) {
    // Supporters have their own queue endpoints — the triage list is the
    // product org's view.
    if (isExternalSupporter(actor)) {
      throw new AppError("IT supporters use the support queue", 403);
    }

    if (params.projectId) {
      await this.projectService.getProject(actor, params.projectId);
      return this.feedbackRepo.fetchPaginated(params as any);
    }

    // Cross-project view, scoped to the actor's own org: admins (including
    // superadmin, whose own org is never a real client company) see their
    // org's tickets; plain users only projects they're members of.
    const isOrgWideManager = seesAllProjects(actor);
    const result = isOrgWideManager
      ? await this.feedbackRepo.fetchPaginated({
          ...params,
          organizationId: actor.organizationId ?? undefined,
        } as any)
      : await this.feedbackRepo.fetchPaginated({ ...params, restrictedUserId: actor.id } as any);

    // This list spans many projects, so the "Manage" action's authority (same
    // bar as manageFeedback: admin/superadmin, or this item's project's team
    // lead) can't be decided with the single page-level flag the per-project
    // Tickets tab uses. Resolve every project this actor leads in one query
    // instead of one per row, then stamp each item.
    const leadProjectIds = isOrgWideManager
      ? null
      : new Set(await this.memberRepo.findLeadProjectIds(actor.id));
    for (const fb of result.data) {
      fb.canManage = isOrgWideManager || Boolean(leadProjectIds?.has(fb.projectId));
    }
    return result;
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
      const now = new Date();
      patch.statusUpdatedAt = now;
      // SLA timestamps — each is set once, the first time it applies (see
      // modules/sla). Any stage past "logged" counts as the first response
      // if nobody has commented yet.
      if (!fb.firstResponseAt && patch.status !== FeedbackStatus.LOGGED) {
        patch.firstResponseAt = now;
      }
      if (!fb.resolvedAt && (patch.status === FeedbackStatus.RESOLVED || patch.status === FeedbackStatus.CLOSED)) {
        patch.resolvedAt = now;
      }
      if (!fb.closedAt && patch.status === FeedbackStatus.CLOSED) {
        patch.closedAt = now;
      }
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
          ticketLabel(fb),
          updated.status,
          copy,
          updated.adminResponse ?? null,
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
          title: ticketLabel(fb),
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
        title: ticketLabel(fb),
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

  // ── Ticket lookup — a submitter's own history, no account (public) ──────────

  // Never reveals whether the email has any tickets — always resolves the
  // same way, same convention as AuthService.forgotPassword. Uses its own,
  // much longer TTL than auth OTPs (see env.ticketLookupCodeTtlMinutes) —
  // read-only access to your own tickets, not an account action, so it's
  // fine for the same code to keep working across a multi-day check-in.
  async requestMyTicketsCode(email: string): Promise<void> {
    const code = generateOtp(6);
    await this.lookupCodeRepo.invalidateActive(email);
    await this.lookupCodeRepo.save({
      email,
      codeHash: hashToken(code),
      expiresAt: new Date(Date.now() + env.ticketLookupCodeTtlMinutes * 60 * 1000),
    });
    sendTicketLookupCodeEmail(email, code).catch((e: Error) =>
      console.error("[mailer] ticket lookup code failed:", e.message)
    );
    if (!env.isProduction) console.info(`[otp] my-tickets code for ${email}: ${code}`);
  }

  // Read-only, so the code isn't single-use — it's valid for repeated
  // lookups (e.g. on every page refresh) until it naturally expires or a new
  // one is requested (which invalidates it). See requestMyTicketsCode.
  async listMyTickets(email: string, code: string) {
    const active = await this.lookupCodeRepo.findActive(email, hashToken(code));
    if (!active) throw new AppError("Invalid or expired code", 401);

    const rows = await this.feedbackRepo.findBySubmitterEmail(email);
    return rows.map(toMyTicketResponse);
  }

  // A resolved ticket's one-time satisfaction rating. Same ownership proof as
  // the rest of "My Tickets" (email + the emailed OTP code) — works for both
  // tiers since rating is a plain field on the row, not part of either
  // lifecycle. Only allowed once the ticket reads as "resolved" to the
  // submitter, and only once per ticket.
  async submitRating(id: string, email: string, code: string, rating: number) {
    const active = await this.lookupCodeRepo.findActive(email, hashToken(code));
    if (!active) throw new AppError("Invalid or expired code", 401);

    const fb = await this.feedbackRepo.findById(id);
    if (!fb || fb.deletedAt || fb.submitterEmail.toLowerCase() !== email.toLowerCase()) {
      throw new AppError("Feedback not found", 404);
    }
    if (toSubmitterStatus(fb) !== SubmitterTicketStatus.RESOLVED) {
      throw new AppError("You can only rate a ticket once it's resolved", 422);
    }
    if (fb.rating != null) {
      throw new AppError("This ticket has already been rated", 409);
    }

    const updated = await this.feedbackRepo.update(fb.id, { rating } as any);

    const project = await this.projectRepo.findById(fb.projectId);
    ActivityService.Instance.log(
      { id: null, organizationId: project?.organizationId ?? null },
      {
        action: "feedback.rated",
        summary: `Submitter rated "${fb.title}" ${rating}/5 in project "${project?.name}"`,
        entityType: "feedback",
        entityId: fb.id,
        metadata: { projectId: fb.projectId, rating },
      }
    );

    return toMyTicketResponse(updated as Feedback);
  }

  // ── Feedback-form link management (admin) ───────────────────────────────────

  // The token is minted once and kept forever after: toggling only flips
  // feedbackEnabled (which findByFeedbackToken checks), so a disable followed
  // by a re-enable brings back the exact same form link instead of orphaning
  // whatever's already shared. Enabling/disabling is still the project's team
  // lead's call — this used to lean on the route guard alone.
  async setFeedbackLink(actor: Actor, projectId: string, enabled: boolean) {
    const project = await this.projectService.getProject(actor, projectId);
    await this.projectService.assertCanManageProject(actor, projectId);
    if (enabled && !project.feedbackToken) {
      project.feedbackToken = randomUUID();
    }
    project.feedbackEnabled = enabled;
    await this.projectRepo.save(project);
    return { feedbackToken: enabled ? project.feedbackToken : null };
  }
}
