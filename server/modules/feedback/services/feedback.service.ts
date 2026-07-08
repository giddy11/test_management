// modules/feedback/services/feedback.service.ts
// External feedback: submitted unauthenticated through a project's public form
// (looked up by projects.feedback_token), then triaged in TestMate. The
// submitter is emailed at every lifecycle stage.
import { randomUUID } from "crypto";
import { FeedbackRepository } from "../repositories/feedback.repository";
import { ProjectRepository } from "../../project/repositories/project.repository";
import { ProjectMemberRepository } from "../../project/repositories/projectMember.repository";
import { ProjectService } from "../../project/services/project.service";
import type { Actor } from "../../../shared/types/actor";

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
} = require("../../../shared/utils/mailer");
const { AppError } = require("../../../shared/errors/AppError");
const { UserRole, FeedbackStatus } = require("../../../config/constants");

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
    "The team believes this is resolved and would love your confirmation. Just reply to this email with your verdict.",
  [FeedbackStatus.CLOSED]: "Your feedback has been closed. Thank you for helping us improve!",
};

export class FeedbackService {
  static Instance = new FeedbackService();

  feedbackRepo: FeedbackRepository;
  projectRepo: any;
  projectService: any;
  memberRepo: ProjectMemberRepository;
  authRepo: any;
  notificationService: any;

  constructor(
    feedbackRepo = FeedbackRepository.Instance,
    projectRepo = ProjectRepository.Instance,
    projectService = ProjectService.Instance,
    memberRepo = ProjectMemberRepository.Instance,
    authRepo = AuthRepository.Instance,
    notificationService = NotificationService.Instance
  ) {
    this.feedbackRepo = feedbackRepo;
    this.projectRepo = projectRepo;
    this.projectService = projectService;
    this.memberRepo = memberRepo;
    this.authRepo = authRepo;
    this.notificationService = notificationService;
  }

  // ── Public form (unauthenticated) ───────────────────────────────────────────

  // The form page shows which product the feedback is for, and its suites so
  // the submitter can (optionally) point at the module their feedback concerns.
  async getPublicForm(token: string) {
    const project = await this.projectRepo.findByFeedbackToken(token);
    if (!project) throw new AppError("This feedback form is not available", 404);
    const suites = await TestSuiteRepository.Instance.findAllByProject(project.id);
    return {
      projectName: project.name,
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
    },
    imageBuffers: Buffer[] = []
  ) {
    const project = await this.projectRepo.findByFeedbackToken(token);
    if (!project) throw new AppError("This feedback form is not available", 404);

    const fb = await this.feedbackRepo.create({
      projectId: project.id,
      type: data.type,
      title: data.title,
      description: data.description,
      suiteName: data.suiteName ?? null,
      submitterName: data.submitterName,
      submitterEmail: data.submitterEmail,
      status: FeedbackStatus.LOGGED,
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
      fb.title
    ).catch((e: Error) => console.error("[feedback] received email failed:", e.message));

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
          });
        }
      })
      .catch((e: Error) => console.error("[feedback] new-feedback notify failed:", e.message));

    return { id: fb.id };
  }

  // ── Authenticated (project members/admins) ──────────────────────────────────

  async fetchFeedback(actor: Actor, params: { projectId: string } & Record<string, unknown>) {
    await this.projectService.getProject(actor, params.projectId);
    return this.feedbackRepo.fetchPaginated(params as any);
  }

  async manageFeedback(
    actor: Actor,
    id: string,
    data: { status?: string; assignedToId?: string | null; adminResponse?: string | null }
  ) {
    const fb = await this.feedbackRepo.findById(id);
    if (!fb || fb.deletedAt) throw new AppError("Feedback not found", 404);
    const project = await this.projectService.getProject(actor, fb.projectId);
    await this.projectService.assertCanManageProject(actor, fb.projectId);

    const patch: Record<string, unknown> = {};
    if (data.adminResponse !== undefined) patch.adminResponse = data.adminResponse;
    if (data.assignedToId !== undefined) {
      if (data.assignedToId) {
        const assignee = await this.authRepo.findUserById(data.assignedToId);
        if (!assignee) throw new AppError("Assignee not found", 404);
      }
      patch.assignedToId = data.assignedToId;
      // Assigning implicitly moves logged/acknowledged feedback forward.
      if (data.assignedToId && data.status === undefined && (fb.status === FeedbackStatus.LOGGED || fb.status === FeedbackStatus.ACKNOWLEDGED)) {
        patch.status = FeedbackStatus.ASSIGNED;
      }
    }
    if (data.status !== undefined) {
      patch.status = data.status;
    }
    if (patch.status && patch.status !== fb.status) {
      patch.statusUpdatedAt = new Date();
    }

    const updated = await this.feedbackRepo.update(fb.id, patch as any);

    ActivityService.Instance.log(actor, {
      action: "feedback.updated",
      summary: `Updated feedback "${fb.title}" to ${updated?.status} in project "${project.name}"`,
      entityType: "feedback",
      entityId: fb.id,
      metadata: { projectId: fb.projectId },
    });

    // Email the external submitter about the stage change.
    if (updated && patch.status && patch.status !== fb.status) {
      const copy = STATUS_EMAIL_COPY[updated.status];
      if (copy) {
        sendFeedbackStatusEmail(
          fb.submitterEmail,
          fb.submitterName,
          project.name,
          fb.title,
          updated.status,
          copy,
          updated.adminResponse ?? null
        ).catch((e: Error) => console.error("[feedback] status email failed:", e.message));
      }
    }

    return updated;
  }

  // ── Feedback-form link management (admin) ───────────────────────────────────

  async setFeedbackLink(actor: Actor, projectId: string, enabled: boolean) {
    const project = await this.projectService.getProject(actor, projectId);
    project.feedbackToken = enabled ? randomUUID() : null;
    await this.projectRepo.save(project);
    return { feedbackToken: project.feedbackToken };
  }
}
