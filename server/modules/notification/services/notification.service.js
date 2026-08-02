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
  sendFeedbackAssignedEmail,
  sendNewFeatureRequestEmail,
  sendFeatureRequestStatusEmail,
  sendFeatureRequestCommentEmail,
  sendFeedbackCommentEmail,
  sendNewBugEmail,
  sendBugStatusEmail,
  sendBugAssignedEmail,
} = require("../../../shared/utils/mailer");
const {
  sendSupportQueueAlertEmail,
  sendFeedbackEscalatedAlertEmail,
  sendFeedbackClosedSupporterEmail,
  sendSupportItemAssignedEmail,
  sendSupportChatOfflineAlertEmail,
} = require("../../../shared/utils/mail/support.mail");
const { hasOnlineSuperAdmin } = require("../../../infrastructure/realtime/socketServer");

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
      sendTestAssignedEmail(u.email, u.firstName, ctx.caseTitle, ctx.assignedByName, url, ctx.organizationId).catch(
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
      sendRunCompletedEmail(u.email, u.firstName, ctx.runName, ctx.summary, url, u.organizationId).catch((e) =>
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
        url,
        r.user.organizationId
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
      sendNewFeedbackAlertEmail(u.email, u.firstName, ctx.title, typeLabel, ctx.projectName, ctx.submitterName, url, ctx.organizationId).catch(
        (e) => console.error("[notify] new-feedback email failed:", e.message)
      );
    }
  }

  // Multiple project members can be assigned to a feedback item at once.
  // ctx: { feedbackId, projectId, projectName, title, assignedByName }
  async notifyFeedbackAssigned(users, ctx) {
    if (!users.length) return;
    const url = `${env.appUrl}/projects/${ctx.projectId}?tab=feedback`;
    await this.repo.createMany(
      users.map((u) => ({
        userId: u.id,
        type: NotificationType.FEEDBACK_ASSIGNED,
        title: `Feedback assigned: ${ctx.title}`,
        body: `${ctx.assignedByName} assigned you to this feedback item`,
        data: { feedbackId: ctx.feedbackId, projectId: ctx.projectId },
      }))
    );
    for (const u of users) {
      sendFeedbackAssignedEmail(u.email, u.firstName, ctx.title, ctx.projectName, ctx.assignedByName, url, ctx.organizationId).catch(
        (e) => console.error("[notify] feedback-assigned email failed:", e.message)
      );
    }
  }

  // A new item landed in a client company's IT support queue.
  // Reuses FEEDBACK_NEW (no enum migration needed) — the URL disambiguates.
  // ctx: { feedbackId, projectId, projectName, companyName, title, type, submitterName, organizationId }
  async notifySupportQueueItem(supporters, ctx) {
    if (!supporters.length) return;
    const url = `${env.appUrl}/support`;
    const typeLabel = String(ctx.type ?? "feedback").replace(/_/g, " ");
    await this.repo.createMany(
      supporters.map((u) => ({
        userId: u.id,
        type: NotificationType.FEEDBACK_NEW,
        title: `New ${typeLabel} in your queue: ${ctx.title}`,
        body: `${ctx.submitterName} submitted feedback about ${ctx.projectName}`,
        data: { feedbackId: ctx.feedbackId, projectId: ctx.projectId, support: true }, // routes to /support — see NotificationBell.linkFor
      }))
    );
    for (const u of supporters) {
      sendSupportQueueAlertEmail(
        u.email,
        u.firstName,
        ctx.title,
        typeLabel,
        ctx.projectName,
        ctx.submitterName,
        url,
        ctx.organizationId
      ).catch((e) => console.error("[notify] support-queue email failed:", e.message));
    }
  }

  // A client company's IT support escalated an item to the product owner's team.
  // ctx: { feedbackId, projectId, projectName, companyName, title, type,
  //        escalatedByName, severity, note, organizationId }
  async notifyFeedbackEscalated(recipients, ctx) {
    if (!recipients.length) return;
    const url = `${env.appUrl}/projects/${ctx.projectId}?tab=feedback`;
    const typeLabel = String(ctx.type ?? "feedback").replace(/_/g, " ");
    const severityLabel = ctx.severity
      ? ctx.severity.charAt(0).toUpperCase() + ctx.severity.slice(1)
      : "Unknown";
    await this.repo.createMany(
      recipients.map((u) => ({
        userId: u.id,
        type: NotificationType.FEEDBACK_NEW,
        title: `Feedback escalated (${severityLabel}): ${ctx.title}`,
        body: `${ctx.escalatedByName} (IT support at ${ctx.companyName}) escalated this ${typeLabel} on ${ctx.projectName}`,
        data: { feedbackId: ctx.feedbackId, projectId: ctx.projectId },
      }))
    );
    for (const u of recipients) {
      sendFeedbackEscalatedAlertEmail(
        u.email,
        u.firstName,
        ctx.title,
        typeLabel,
        ctx.projectName,
        ctx.companyName,
        ctx.escalatedByName,
        severityLabel,
        ctx.note ?? null,
        url,
        ctx.organizationId
      ).catch((e) => console.error("[notify] escalation email failed:", e.message));
    }
  }

  // The product team closed an item this supporter escalated — the true end
  // user never sees product-team stage emails, so this tells the supporter to
  // relay the fix themselves.
  // ctx: { feedbackId, projectId, projectName, companyName, title, adminResponse, organizationId }
  async notifyFeedbackClosedForSupporter(supporter, ctx) {
    if (!supporter) return;
    const url = `${env.appUrl}/support`;
    await this.repo.createMany([
      {
        userId: supporter.id,
        type: NotificationType.FEEDBACK_CLOSED_SUPPORTER,
        title: `Closed: ${ctx.title}`,
        body: `The product team closed the escalated item "${ctx.title}" on ${ctx.projectName} — let your user know it's fixed.`,
        data: { feedbackId: ctx.feedbackId, projectId: ctx.projectId, support: true },
      },
    ]);
    sendFeedbackClosedSupporterEmail(
      supporter.email,
      supporter.firstName,
      ctx.companyName,
      ctx.projectName,
      ctx.title,
      ctx.adminResponse ?? null,
      url,
      ctx.organizationId
    ).catch((e) => console.error("[notify] closed-supporter email failed:", e.message));
  }

  // The submitter posted a new message on a ticket's comment thread — notify
  // whichever staff are currently handling it (product-team assignees/admins,
  // or the IT-support assignee/leads for a pre-escalation company ticket).
  // ctx: { feedbackId, projectId, projectName, title, commenterName, support }
  async notifyFeedbackComment(recipients, ctx) {
    if (!recipients.length) return;
    const url = ctx.support ? `${env.appUrl}/support` : `${env.appUrl}/projects/${ctx.projectId}?tab=feedback`;
    await this.repo.createMany(
      recipients.map((u) => ({
        userId: u.id,
        type: NotificationType.FEEDBACK_COMMENT,
        title: `New message: ${ctx.title}`,
        body: `${ctx.commenterName} posted a new message on this ticket`,
        data: { feedbackId: ctx.feedbackId, projectId: ctx.projectId, support: ctx.support || undefined },
      }))
    );
    for (const u of recipients) {
      sendFeedbackCommentEmail(u.email, u.firstName, ctx.title, ctx.commenterName, url, ctx.organizationId).catch(
        (e) => console.error("[notify] feedback-comment email failed:", e.message)
      );
    }
  }

  // An IT support lead routed a queue item to a teammate within their company.
  // ctx: { feedbackId, projectId, projectName, companyName, title, assignedByName, organizationId }
  async notifySupportItemAssigned(supporter, ctx) {
    if (!supporter) return;
    const url = `${env.appUrl}/support`;
    await this.repo.createMany([
      {
        userId: supporter.id,
        type: NotificationType.SUPPORT_ITEM_ASSIGNED,
        title: `Ticket assigned to you: ${ctx.title}`,
        body: `${ctx.assignedByName} assigned you this ticket in ${ctx.companyName}'s queue`,
        data: { feedbackId: ctx.feedbackId, projectId: ctx.projectId, support: true },
      },
    ]);
    sendSupportItemAssignedEmail(
      supporter.email,
      supporter.firstName,
      ctx.title,
      ctx.companyName,
      ctx.projectName,
      ctx.assignedByName,
      url,
      ctx.organizationId ?? null
    ).catch((e) => console.error("[notify] support-item-assigned email failed:", e.message));
  }

  // The submitter used the confirmation link to close or reopen a feedback item.
  // ctx: { feedbackId, projectId, projectName, title, confirmed, reopenReason }
  async notifyFeedbackConfirmed(recipients, ctx) {
    if (!recipients.length) return;
    const reopenBody = `The submitter said "${ctx.title}" isn't fixed — it's back to investigating${
      ctx.reopenReason ? `: "${ctx.reopenReason}"` : ""
    }`;
    await this.repo.createMany(
      recipients.map((u) => ({
        userId: u.id,
        type: NotificationType.FEEDBACK_CONFIRMED,
        title: ctx.confirmed
          ? `Feedback confirmed resolved: ${ctx.title}`
          : `Feedback reopened: ${ctx.title}`,
        body: ctx.confirmed
          ? `The submitter confirmed "${ctx.title}" is resolved — it's now closed`
          : reopenBody,
        data: { feedbackId: ctx.feedbackId, projectId: ctx.projectId },
      }))
    );
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
      sendNewFeatureRequestEmail(u.email, u.firstName, ctx.title, ctx.submittedByName, url, ctx.organizationId).catch((e) =>
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
        u.id === ctx.submittedById,
        ctx.organizationId
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
    sendFeatureRequestCommentEmail(user.email, user.firstName, ctx.title, ctx.commenterName, url, user.organizationId).catch((e) =>
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
      sendNewBugEmail(u.email, u.firstName, ctx.title, ctx.reportedByName, url, ctx.organizationId).catch((e) =>
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
        u.id === ctx.reportedById,
        ctx.organizationId
      ).catch((e) => console.error("[notify] bug-status email failed:", e.message));
    }
  }

  // A user sent a message in the in-app support chat — alert every super admin.
  // In-app is always created; email only goes out when no super admin is
  // currently online to see it live (support chat is otherwise a
  // presence-driven channel, and always-emailing every message would be noisy).
  // ctx: { conversationId, senderName, preview }
  async notifyNewSupportChatMessage(admins, ctx) {
    const users = Array.isArray(admins) ? admins : [admins];
    if (!users.length) return;
    await this.repo.createMany(
      users.map((u) => ({
        userId: u.id,
        type: NotificationType.SUPPORT_CHAT_MESSAGE,
        title: `New support message from ${ctx.senderName}`,
        body: ctx.preview,
        data: { conversationId: ctx.conversationId, support: true },
      }))
    );
    if (!hasOnlineSuperAdmin()) {
      const url = `${env.appUrl}/support-inbox`;
      for (const u of users) {
        sendSupportChatOfflineAlertEmail(
          u.email,
          u.firstName,
          ctx.senderName,
          ctx.preview,
          url,
          u.organizationId
        ).catch((e) => console.error("[notify] support-chat-offline email failed:", e.message));
      }
    }
  }

  // A super admin replied — notify the user who owns the conversation. In-app only.
  // ctx: { conversationId, preview }
  async notifySupportChatReply(user, ctx) {
    if (!user) return;
    await this.repo.createMany([
      {
        userId: user.id,
        type: NotificationType.SUPPORT_CHAT_REPLY,
        title: "Support replied to your message",
        body: ctx.preview,
        data: { conversationId: ctx.conversationId, support: true },
      },
    ]);
  }

  // A visitor messaged a project's embedded live-chat widget — the widget has
  // no in-app inbox to reply through, so unlike support-chat there's no reply
  // notification back the other way; staff see replies land live in the widget.
  // ctx: { conversationId, projectId, senderName, preview }
  async notifyNewLiveChatMessage(recipients, ctx) {
    if (!recipients.length) return;
    await this.repo.createMany(
      recipients.map((u) => ({
        userId: u.id,
        type: NotificationType.LIVE_CHAT_MESSAGE,
        title: `New live-chat message from ${ctx.senderName}`,
        body: ctx.preview,
        data: { conversationId: ctx.conversationId, projectId: ctx.projectId },
      }))
    );
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
    sendBugAssignedEmail(user.email, user.firstName, ctx.title, url, user.organizationId).catch((e) =>
      console.error("[notify] bug-assigned email failed:", e.message)
    );
  }
}

module.exports = { NotificationService };

