// modules/notification/services/notification.service.js
// Creates in-app notifications AND sends emails. Email sends are fire-and-forget
// so a mail failure never breaks the triggering request.
const { NotificationRepository } = require("../repositories/notification.repository");
const { AuthRepository } = require("../../auth/repositories/auth.repository");
const { NotificationType } = require("../../../config/constants");
const { env } = require("../../../config/env");
const {
  sendTestAssignedEmail,
  sendRunCompletedEmail,
  sendProjectMemberAddedEmail,
  sendNewFeedbackAlertEmail,
  sendNewFeatureRequestEmail,
  sendFeatureRequestStatusEmail,
  sendFeatureRequestCommentEmail,
  sendNewBugEmail,
  sendBugStatusEmail,
  sendBugAssignedEmail,
} = require("../../../shared/utils/mailer");

class NotificationService {
  static Instance = new NotificationService();

  constructor(
    repo = NotificationRepository.Instance,
    authRepo = AuthRepository.Instance
  ) {
    this.repo = repo;
    this.authRepo = authRepo;
  }

  // ── Reads ──────────────────────────────────────────────────────────────────
  fetch(userId, params) {
    return this.repo.fetchPaginated({ ...params, userId });
  }
  unreadCount(userId) {
    return this.repo.unreadCount(userId);
  }
  markRead(id, userId) {
    return this.repo.markRead(id, userId);
  }
  markAllRead(userId) {
    return this.repo.markAllRead(userId);
  }

  // ── Triggers (fire-and-forget — callers don't await these) ───────────────────
  async notifyAssignment(users, ctx) {
    if (!users.length) return;
    const url = `${env.appUrl}/projects/${ctx.projectId}/suites/${ctx.suiteId}/cases/${ctx.caseId}`;
    await this.repo.createMany(
      users.map((u) => ({
        userId: u.id,
        type: NotificationType.TEST_ASSIGNED,
        title: `Assigned: ${ctx.caseTitle}`,
        body: `${ctx.assignedByName} assigned you to this test case`,
        data: { caseId: ctx.caseId, suiteId: ctx.suiteId, projectId: ctx.projectId },
      }))
    );
    for (const u of users) {
      sendTestAssignedEmail(u.email, u.firstName, ctx.caseTitle, ctx.assignedByName, url).catch(
        (e) => console.error("[notify] assignment email failed:", e.message)
      );
    }
  }

  // userIds: run creator + the project's members (deduped by the caller).
  async notifyRunCompleted(userIds, ctx) {
    const ids = Array.isArray(userIds) ? userIds : [userIds];
    const users = (
      await Promise.all(ids.map((id) => this.authRepo.findUserById(id)))
    ).filter(Boolean);
    if (!users.length) return;
    const by = ctx.byUserId ? await this.authRepo.findUserById(ctx.byUserId) : null;
    const byName = by ? [by.firstName, by.lastName].filter(Boolean).join(" ") : "A teammate";
    const url = `${env.appUrl}/projects/${ctx.projectId}/runs/${ctx.runId}`;
    await this.repo.createMany(
      users.map((u) => ({
        userId: u.id,
        type: NotificationType.RUN_COMPLETED,
        title: `Run completed: ${ctx.runName}`,
        body: `${byName} marked this run completed`,
        data: { runId: ctx.runId, projectId: ctx.projectId },
      }))
    );
    for (const u of users) {
      sendRunCompletedEmail(u.email, u.firstName, ctx.runName, ctx.summary, url).catch((e) =>
        console.error("[notify] run-completed email failed:", e.message)
      );
    }
  }

  // recipients: [{ user, role }] — newly added project members.
  // ctx: { projectId, projectName, addedByName }
  async notifyProjectMemberAdded(recipients, ctx) {
    if (!recipients.length) return;
    const url = `${env.appUrl}/projects/${ctx.projectId}`;
    const roleLabel = (role) => (role === "team_lead" ? "team lead" : "member");
    await this.repo.createMany(
      recipients.map((r) => ({
        userId: r.user.id,
        type: NotificationType.PROJECT_MEMBER_ADDED,
        title: `Added to project: ${ctx.projectName}`,
        body: `${ctx.addedByName} added you as a ${roleLabel(r.role)}`,
        data: { projectId: ctx.projectId, role: r.role },
      }))
    );
    for (const r of recipients) {
      sendProjectMemberAddedEmail(
        r.user.email,
        r.user.firstName,
        ctx.projectName,
        roleLabel(r.role),
        ctx.addedByName,
        url
      ).catch((e) => console.error("[notify] member-added email failed:", e.message));
    }
  }

  // External feedback arrived via a project's public form.
  // ctx: { feedbackId, projectId, projectName, title, type, submitterName }
  async notifyNewFeedback(recipients, ctx) {
    if (!recipients.length) return;
    const url = `${env.appUrl}/projects/${ctx.projectId}`;
    const typeLabel = String(ctx.type ?? "feedback").replace(/_/g, " ");
    await this.repo.createMany(
      recipients.map((u) => ({
        userId: u.id,
        type: NotificationType.FEEDBACK_NEW,
        title: `New external ${typeLabel}: ${ctx.title}`,
        body: `${ctx.submitterName} submitted feedback on ${ctx.projectName} via the public form`,
        data: { feedbackId: ctx.feedbackId, projectId: ctx.projectId },
      }))
    );
    for (const u of recipients) {
      sendNewFeedbackAlertEmail(u.email, u.firstName, ctx.title, typeLabel, ctx.projectName, ctx.submitterName, url).catch(
        (e) => console.error("[notify] new-feedback email failed:", e.message)
      );
    }
  }

  // ctx: { requestId, projectId, title, submittedByName }
  // Callers exclude the submitter — nobody is notified about their own action.
  async notifyNewFeatureRequest(recipients, ctx) {
    if (!recipients.length) return;
    const url = `${env.appUrl}/projects/${ctx.projectId}/feature-requests/${ctx.requestId}`;
    await this.repo.createMany(
      recipients.map((u) => ({
        userId: u.id,
        type: NotificationType.FEATURE_REQUEST_NEW,
        title: `New feature request: ${ctx.title}`,
        body: `${ctx.submittedByName} submitted a new feature request`,
        data: { requestId: ctx.requestId, projectId: ctx.projectId },
      }))
    );
    for (const u of recipients) {
      sendNewFeatureRequestEmail(u.email, u.firstName, ctx.title, ctx.submittedByName, url).catch((e) =>
        console.error("[notify] new-feature-request email failed:", e.message)
      );
    }
  }

  // recipients: the submitter + the project's members (deduped by the caller).
  // ctx: { requestId, projectId, title, status, adminResponse, submittedById }
  async notifyFeatureRequestStatusChanged(recipients, ctx) {
    const users = Array.isArray(recipients) ? recipients : [recipients];
    if (!users.length) return;
    const url = `${env.appUrl}/projects/${ctx.projectId}/feature-requests/${ctx.requestId}`;
    await this.repo.createMany(
      users.map((u) => ({
        userId: u.id,
        type: NotificationType.FEATURE_REQUEST_STATUS_CHANGED,
        title:
          u.id === ctx.submittedById
            ? `Your feature request status changed: ${ctx.title}`
            : `Feature request status changed: ${ctx.title}`,
        body: `"${ctx.title}" is now ${ctx.status.replace(/_/g, " ")}`,
        data: { requestId: ctx.requestId, projectId: ctx.projectId, status: ctx.status },
      }))
    );
    for (const u of users) {
      sendFeatureRequestStatusEmail(
        u.email,
        u.firstName,
        ctx.title,
        ctx.status,
        ctx.adminResponse,
        url,
        u.id === ctx.submittedById
      ).catch((e) => console.error("[notify] feature-request-status email failed:", e.message));
    }
  }

  // ctx: { requestId, projectId, title, commenterName }
  async notifyFeatureRequestComment(user, ctx) {
    const url = `${env.appUrl}/projects/${ctx.projectId}/feature-requests/${ctx.requestId}`;
    await this.repo.createMany([
      {
        userId: user.id,
        type: NotificationType.FEATURE_REQUEST_COMMENT,
        title: `New comment on: ${ctx.title}`,
        body: `${ctx.commenterName} commented on your feature request`,
        data: { requestId: ctx.requestId, projectId: ctx.projectId },
      },
    ]);
    sendFeatureRequestCommentEmail(user.email, user.firstName, ctx.title, ctx.commenterName, url).catch((e) =>
      console.error("[notify] feature-request-comment email failed:", e.message)
    );
  }

  // ctx: { bugId, projectId, title, reportedByName }
  async notifyNewBug(recipients, ctx) {
    if (!recipients.length) return;
    const url = `${env.appUrl}/projects/${ctx.projectId}/bugs/${ctx.bugId}`;
    await this.repo.createMany(
      recipients.map((u) => ({
        userId: u.id,
        type: NotificationType.BUG_REPORTED,
        title: `New bug: ${ctx.title}`,
        body: `${ctx.reportedByName} reported a new bug`,
        data: { bugId: ctx.bugId, projectId: ctx.projectId },
      }))
    );
    for (const u of recipients) {
      sendNewBugEmail(u.email, u.firstName, ctx.title, ctx.reportedByName, url).catch((e) =>
        console.error("[notify] new-bug email failed:", e.message)
      );
    }
  }

  // recipients: the reporter + the project's members (deduped by the caller).
  // ctx: { bugId, projectId, title, status, reportedById }
  async notifyBugStatusChanged(recipients, ctx) {
    const users = Array.isArray(recipients) ? recipients : [recipients];
    if (!users.length) return;
    const url = `${env.appUrl}/projects/${ctx.projectId}/bugs/${ctx.bugId}`;
    await this.repo.createMany(
      users.map((u) => ({
        userId: u.id,
        type: NotificationType.BUG_STATUS_CHANGED,
        title: `Bug status changed: ${ctx.title}`,
        body: `"${ctx.title}" is now ${ctx.status}`,
        data: { bugId: ctx.bugId, projectId: ctx.projectId, status: ctx.status },
      }))
    );
    for (const u of users) {
      sendBugStatusEmail(
        u.email,
        u.firstName,
        ctx.title,
        ctx.status,
        url,
        u.id === ctx.reportedById
      ).catch((e) => console.error("[notify] bug-status email failed:", e.message));
    }
  }

  // ctx: { bugId, projectId, title }
  async notifyBugAssigned(user, ctx) {
    const url = `${env.appUrl}/projects/${ctx.projectId}/bugs/${ctx.bugId}`;
    await this.repo.createMany([
      {
        userId: user.id,
        type: NotificationType.BUG_ASSIGNED,
        title: `Bug assigned: ${ctx.title}`,
        body: `You've been assigned to fix "${ctx.title}"`,
        data: { bugId: ctx.bugId, projectId: ctx.projectId },
      },
    ]);
    sendBugAssignedEmail(user.email, user.firstName, ctx.title, url).catch((e) =>
      console.error("[notify] bug-assigned email failed:", e.message)
    );
  }
}

module.exports = { NotificationService };

