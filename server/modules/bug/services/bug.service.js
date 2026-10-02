// modules/bug/services/bug.service.js
const { BugRepository } = require("../repositories/bug.repository");
const { BugCommentRepository } = require("../repositories/bugComment.repository");
const { BugStatusHistoryRepository } = require("../repositories/bugStatusHistory.repository");
const { ProjectService } = require("../../project/services/project.service");
const { AuthRepository } = require("../../auth/repositories/auth.repository");
const { TestCaseRepository } = require("../../testCase/repositories/testCase.repository");
const { TestSuiteRepository } = require("../../testSuite/repositories/testSuite.repository");
const { TestRunRepository } = require("../../testRun/repositories/testRun.repository");
const { NotificationService } = require("../../notification/services/notification.service");
const { ActivityService } = require("../../activity/services/activity.service");
const {
  ProjectMemberRepository,
} = require("../../project/repositories/projectMember.repository");
const { AppError } = require("../../../shared/errors/AppError");
const { parseReferenceCode } = require("../../../shared/utils/referenceCode");
const { UserRole, BugStatus } = require("../../../config/constants");

// PATCH /bugs/:id fields that need manage rights vs. ones the reporter may fix.
const TRIAGE_FIELDS = ["status", "severity", "priority", "assignedToId"];
const CONTENT_FIELDS = [
  "title",
  "description",
  "stepsToReproduce",
  "expectedBehavior",
  "actualBehavior",
  "environment",
  "testCaseId",
];

// The report — what was found, and how — can only be corrected while the bug is
// Open, or Reopened (it resurfaced, so the report is worth correcting again).
// Once work on it starts it is a record of what the team acted on, and rewriting
// it underneath them (a new title, different steps) would make their work and any
// links to other reports read as something they weren't. Triage still moves
// freely; only the report's own fields lock.
const EDITABLE_BUG_STATUSES = new Set([BugStatus.OPEN, BugStatus.REOPENED]);

function assertReportEditable(status) {
  if (EDITABLE_BUG_STATUSES.has(status)) return;
  throw new AppError(
    `This bug is ${status}, so its report can no longer be edited. A report can only be edited while the bug is Open or Reopened.`,
    422
  );
}

// The lifecycle's stages in order. "Reopened" isn't one of them: it's how a bug
// that had been fixed re-enters the sequence, so it sits just before In Progress.
const BUG_STAGES = [
  BugStatus.OPEN,
  BugStatus.IN_PROGRESS,
  BugStatus.FIXED,
  BugStatus.VERIFIED,
  BugStatus.CLOSED,
];
const bugRank = (status) => (status === BugStatus.REOPENED ? 0.5 : BUG_STAGES.indexOf(status));
// A bug can only be reopened once it has been declared fixed — the same
// stages that count as "resolved" for the SLA.
const RESOLVED_BUG_STATUSES = new Set([BugStatus.FIXED, BugStatus.VERIFIED, BugStatus.CLOSED]);
const REOPENABLE_BUG_STATUSES = RESOLVED_BUG_STATUSES;

// A bug only moves forward — it can't return to an earlier status. The one way
// back is Reopened (a fixed bug resurfaces), after which it works forward again
// from In Progress. Skipping ahead is allowed, and keeping the current status is
// always fine. Mirrored on the client in isBugStatusSelectable (lib/enums.ts).
function assertValidStatusTransition(current, next) {
  if (current === next) return;
  if (next === BugStatus.REOPENED) {
    if (!REOPENABLE_BUG_STATUSES.has(current)) {
      throw new AppError("Only a bug that has been fixed can be reopened.", 422);
    }
    return;
  }
  if (bugRank(next) < bugRank(current)) {
    throw new AppError(
      `A bug can't go back to an earlier status — it is already "${current}".`,
      422
    );
  }
}

class BugService {
  static Instance = new BugService();

  constructor(
    bugRepo = BugRepository.Instance,
    projectService = ProjectService.Instance,
    authRepo = AuthRepository.Instance,
    testCaseRepo = TestCaseRepository.Instance,
    testSuiteRepo = TestSuiteRepository.Instance,
    testRunRepo = TestRunRepository.Instance,
    notificationService = NotificationService.Instance,
    memberRepo = ProjectMemberRepository.Instance,
    historyRepo = BugStatusHistoryRepository.Instance,
    commentRepo = BugCommentRepository.Instance
  ) {
    this.bugRepo = bugRepo;
    this.projectService = projectService;
    this.authRepo = authRepo;
    this.testCaseRepo = testCaseRepo;
    this.testSuiteRepo = testSuiteRepo;
    this.testRunRepo = testRunRepo;
    this.notificationService = notificationService;
    this.memberRepo = memberRepo;
    this.historyRepo = historyRepo;
    this.commentRepo = commentRepo;
  }

  // Fetches the bug, 404s if missing/deleted, then checks project access —
  // same "check access via parent" pattern as FeatureRequestService.getAccessible.
  async getAccessible(actor, id) {
    const bug = await this.bugRepo.findById(id);
    if (!bug || bug.deletedAt) throw new AppError("Bug not found", 404);
    await this.projectService.getProject(actor, bug.projectId);
    return bug;
  }

  async fetchBugs(actor, params) {
    await this.projectService.getProject(actor, params.projectId);
    return this.bugRepo.fetchPaginated(params);
  }

  async getBug(actor, id) {
    return this.getAccessible(actor, id);
  }

  // Same as getAccessible but resolves via the human-readable reference code
  // (e.g. "BF-014") instead of the uuid — backs the /by-code deep link used
  // by the "share link" button on the bug detail page.
  async getBugByCode(actor, code) {
    const bugNumber = parseReferenceCode("BF", code);
    if (bugNumber == null) throw new AppError("Bug not found", 404);
    const bug = await this.bugRepo.findByNumber(bugNumber);
    if (!bug || bug.deletedAt) throw new AppError("Bug not found", 404);
    await this.projectService.getProject(actor, bug.projectId);
    return bug;
  }

  // Every status the bug has entered, oldest first (a reopened bug appears
  // more than once per stage).
  async getStatusTimeline(actor, id) {
    await this.getAccessible(actor, id);
    return this.historyRepo.findByBug(id);
  }

  // Confirms an optional testCaseId/testRunId actually belongs to the same
  // project as the bug — cheap existence + ownership check, same defensive
  // style as ProjectService.resolveMembers.
  async _assertLinksBelongToProject(projectId, { testCaseId, testRunId }) {
    if (testCaseId) {
      const testCase = await this.testCaseRepo.findById(testCaseId);
      if (!testCase) throw new AppError("Related test case not found", 404);
      const suite = await this.testSuiteRepo.findById(testCase.suiteId);
      if (!suite || suite.projectId !== projectId) {
        throw new AppError("Related test case does not belong to this project", 422);
      }
    }
    if (testRunId) {
      const run = await this.testRunRepo.findById(testRunId);
      if (!run || run.projectId !== projectId) {
        throw new AppError("Related test run does not belong to this project", 422);
      }
    }
  }

  async createBug(actor, data) {
    const project = await this.projectService.getProject(actor, data.projectId);
    // Reporting a bug is taking part in the project. A read-only viewer can read
    // every bug but not raise one.
    await this.projectService.assertCanContribute(actor, data.projectId);
    await this._assertLinksBelongToProject(data.projectId, data);

    const bug = await this.bugRepo.create({
      projectId: data.projectId,
      title: data.title,
      description: data.description,
      stepsToReproduce: data.stepsToReproduce ?? null,
      expectedBehavior: data.expectedBehavior ?? null,
      actualBehavior: data.actualBehavior ?? null,
      environment: data.environment ?? null,
      severity: data.severity,
      priority: data.priority,
      testCaseId: data.testCaseId ?? null,
      testRunId: data.testRunId ?? null,
      reportedById: actor.id,
      status: BugStatus.OPEN,
    });

    // First entry in the SLA "paused time" timeline — same pattern as
    // FeedbackService seeding feedback_status_history on creation.
    this.historyRepo
      .create({ bugId: bug.id, status: BugStatus.OPEN, enteredAt: bug.createdAt })
      .catch((e) => console.error("[bug] history entry failed:", e.message));

    ActivityService.Instance.log(actor, {
      action: "bug.created",
      summary: `Reported bug "${bug.title}" in project "${project.name}"`,
      entityType: "bug",
      entityId: bug.id,
      metadata: { projectId: bug.projectId },
    });

    // Notify the project's own org admins + the project's members — this is
    // company-operational data, so superadmins (platform-wide oversight) are
    // deliberately excluded. The reporter is excluded too; they already know.
    Promise.all([
      project.organizationId
        ? this.authRepo.findByRoleAndOrg(UserRole.ADMIN, project.organizationId)
        : Promise.resolve([]),
      this.authRepo.findUserById(actor.id),
      this.memberRepo.findMemberUsers(bug.projectId),
    ])
      .then(([orgAdmins, reporter, members]) => {
        const recipients = [
          ...new Map(
            [...orgAdmins, ...members]
              .filter((u) => u.id !== actor.id)
              .map((u) => [u.id, u])
          ).values(),
        ];
        if (recipients.length) {
          const reportedByName = reporter
            ? [reporter.firstName, reporter.lastName].filter(Boolean).join(" ")
            : "A user";
          this.notificationService.notifyNewBug(recipients, {
            bugId: bug.id,
            projectId: bug.projectId,
            title: bug.title,
            reportedByName,
            organizationId: project.organizationId,
          });
        }
      })
      .catch((e) => console.error("[bug] new-bug notify failed:", e.message));

    return this.bugRepo.findById(bug.id);
  }

  async manageBug(actor, id, data) {
    const bug = await this.getAccessible(actor, id);
    await this.projectService.assertCanContribute(actor, bug.projectId);

    // Triage fields (status/severity/priority/assignee) are for the project's
    // team lead only — severity/priority also drive the SLA targets, so a
    // reporter must not be able to relax their own, and a reporter cannot
    // verify or close their own report unless they also lead the project.
    // Fixing a mistake in the report itself is also open to whoever reported it;
    // a request that mixes both is treated as triage (all-or-nothing).
    const touchesTriage = TRIAGE_FIELDS.some((f) => data[f] !== undefined);
    const isReporter = bug.reportedById === actor.id;
    if (touchesTriage || !isReporter) {
      await this.projectService.assertCanManageProject(actor, bug.projectId);
    }
    // Judged on the status the bug has NOW, and for everyone — admins and the
    // team lead included, since the lock protects the record, not a permission.
    if (CONTENT_FIELDS.some((f) => data[f] !== undefined)) {
      assertReportEditable(bug.status);
    }
    if (data.testCaseId) {
      await this._assertLinksBelongToProject(bug.projectId, { testCaseId: data.testCaseId });
    }

    if (data.status !== undefined) assertValidStatusTransition(bug.status, data.status);

    const patch = {};
    if (data.severity !== undefined) patch.severity = data.severity;
    if (data.priority !== undefined) patch.priority = data.priority;
    if (data.assignedToId !== undefined) patch.assignedToId = data.assignedToId;
    for (const field of CONTENT_FIELDS) {
      if (data[field] !== undefined) patch[field] = data[field];
    }

    const previousStatus = bug.status;
    // Only a real move counts as a transition: the edit form resends the current
    // status with every triage change, and treating that as one would stamp a
    // first response, push closedAt forward and reset statusUpdatedAt.
    if (data.status !== undefined && data.status !== bug.status) {
      patch.status = data.status;
      patch.statusUpdatedAt = new Date();
      if (!bug.firstResponseAt) {
        patch.firstResponseAt = patch.statusUpdatedAt;
      }
      // A bug may skip ahead (e.g. Open → Closed), so every resolved stage
      // stamps resolvedAt — not just Fixed — or the SLA would never see it resolved.
      if (RESOLVED_BUG_STATUSES.has(data.status) && !bug.resolvedAt) {
        patch.resolvedAt = new Date();
      }
      if (data.status === BugStatus.CLOSED) {
        patch.closedAt = new Date();
      }
      if (data.status === BugStatus.REOPENED) {
        patch.resolvedAt = null;
        patch.closedAt = null;
      }
    }

    const updated = await this.bugRepo.update(id, patch);
    const project = await this.projectService.getProject(actor, bug.projectId);

    // One history row per status entered — powers the SLA "paused time"
    // calculation and a timeline, same as FeedbackService.
    if (patch.status && patch.status !== bug.status) {
      this.historyRepo
        .create({ bugId: bug.id, status: patch.status, enteredAt: patch.statusUpdatedAt })
        .catch((e) => console.error("[bug] history entry failed:", e.message));
    }

    ActivityService.Instance.log(actor, {
      action: "bug.updated",
      summary: `Updated bug "${bug.title}" in project "${project.name}"`,
      entityType: "bug",
      entityId: bug.id,
      metadata: { projectId: bug.projectId },
    });

    // Status changes fan out to the reporter + every project member (in-app +
    // email), excluding whoever made the change.
    if (data.status !== undefined && data.status !== previousStatus) {
      Promise.all([
        bug.reportedById ? this.authRepo.findUserById(bug.reportedById) : Promise.resolve(null),
        this.memberRepo.findMemberUsers(bug.projectId),
      ])
        .then(([reporter, members]) => {
          const pool = [...members];
          if (reporter) pool.push(reporter);
          const recipients = [
            ...new Map(pool.filter((u) => u.id !== actor.id).map((u) => [u.id, u])).values(),
          ];
          if (recipients.length) {
            this.notificationService.notifyBugStatusChanged(recipients, {
              bugId: bug.id,
              projectId: bug.projectId,
              title: bug.title,
              status: updated.status,
              reportedById: bug.reportedById,
              organizationId: project.organizationId,
            });
          }
        })
        .catch((e) => console.error("[bug] status notify failed:", e.message));
    }

    if (
      data.assignedToId !== undefined &&
      data.assignedToId &&
      data.assignedToId !== bug.assignedToId &&
      data.assignedToId !== actor.id
    ) {
      this.authRepo
        .findUserById(data.assignedToId)
        .then((assignee) => {
          if (assignee) {
            this.notificationService.notifyBugAssigned(assignee, {
              bugId: bug.id,
              projectId: bug.projectId,
              title: bug.title,
            });
          }
        })
        .catch((e) => console.error("[bug] assign notify failed:", e.message));
    }

    return updated;
  }

  async deleteBug(actor, id) {
    const bug = await this.getAccessible(actor, id);
    await this.projectService.assertCanManageProject(actor, bug.projectId);
    const project = await this.projectService.getProject(actor, bug.projectId);
    await this.bugRepo.softDelete(id);
    ActivityService.Instance.log(actor, {
      action: "bug.deleted",
      summary: `Deleted bug "${bug.title}" in project "${project.name}"`,
      entityType: "bug",
      entityId: bug.id,
      metadata: { projectId: bug.projectId },
    });
  }

  async fetchComments(actor, id, params) {
    await this.getAccessible(actor, id);
    return this.commentRepo.fetchPaginated(id, params);
  }

  // A reply always threads under a root comment: replying to a reply resolves
  // to that reply's own parent, so there's never a third level to render.
  async _resolveParentId(bugId, parentId) {
    if (!parentId) return null;
    const parent = await this.commentRepo.findById(parentId);
    if (!parent || parent.bugId !== bugId) {
      throw new AppError("Comment not found", 404);
    }
    return parent.parentId ?? parent.id;
  }

  // Only an actual project member can be @mentioned (matches who could
  // plausibly see/act on the thread), and mentioning yourself is a no-op —
  // filtered out rather than rejected, since the client can't always know in
  // advance who's a member.
  async _resolveMentions(projectId, actorId, mentionedUserIds) {
    if (!mentionedUserIds || mentionedUserIds.length === 0) return [];
    const uniqueIds = [...new Set(mentionedUserIds)].filter((uid) => uid !== actorId);
    if (uniqueIds.length === 0) return [];
    const members = await this.memberRepo.findMemberUsers(projectId);
    const memberById = new Map(members.map((u) => [u.id, u]));
    return uniqueIds
      .filter((uid) => memberById.has(uid))
      .map((uid) => {
        const u = memberById.get(uid);
        return { userId: u.id, name: [u.firstName, u.lastName].filter(Boolean).join(" ") };
      });
  }

  async addComment(actor, id, body, parentId, mentionedUserIds) {
    const bug = await this.getAccessible(actor, id);
    await this.projectService.assertCanContribute(actor, bug.projectId);
    const resolvedParentId = await this._resolveParentId(id, parentId);
    const mentions = await this._resolveMentions(bug.projectId, actor.id, mentionedUserIds);

    // Firestore has no join — the author's display name is denormalized onto the doc.
    const commenter = await this.authRepo.findUserById(actor.id);
    const commenterName = commenter
      ? [commenter.firstName, commenter.lastName].filter(Boolean).join(" ")
      : null;

    const comment = await this.commentRepo.create({
      bugId: id,
      parentId: resolvedParentId,
      authorId: actor.id,
      authorName: commenterName,
      body,
      mentions,
    });

    // Firestore write and Postgres counter update aren't in one transaction (different
    // databases) — accepted eventual-consistency tradeoff, same as the notify call below.
    await this.bugRepo.incrementCommentCount(id);

    if (mentions.length) {
      Promise.all(mentions.map((m) => this.authRepo.findUserById(m.userId)))
        .then((users) => {
          for (const u of users) {
            if (!u) continue;
            this.notificationService.notifyBugMention(u, {
              bugId: bug.id,
              projectId: bug.projectId,
              title: bug.title,
              mentionerName: commenterName || "Someone",
            });
          }
        })
        .catch((e) => console.error("[bug] mention notify failed:", e.message));
    }

    if (bug.reportedById && bug.reportedById !== actor.id) {
      this.authRepo
        .findUserById(bug.reportedById)
        .then((reporter) => {
          if (reporter) {
            this.notificationService.notifyBugComment(reporter, {
              bugId: bug.id,
              projectId: bug.projectId,
              title: bug.title,
              commenterName: commenterName || "Someone",
            });
          }
        })
        .catch((e) => console.error("[bug] comment notify failed:", e.message));
    }

    return comment;
  }

  async deleteComment(actor, id, commentId) {
    const bug = await this.getAccessible(actor, id);

    const comment = await this.commentRepo.findById(commentId);
    if (!comment || comment.deletedAt || comment.bugId !== id) {
      throw new AppError("Comment not found", 404);
    }
    if (
      comment.authorId !== actor.id &&
      !(await this.projectService.canManageProject(actor, bug.projectId))
    ) {
      throw new AppError("You can only delete your own comments", 403);
    }
    if (await this.commentRepo.hasReplies(commentId)) {
      throw new AppError("This comment has replies — delete those first", 422);
    }
    await this.commentRepo.softDelete(commentId);
    await this.bugRepo.decrementCommentCount(id);
  }

  // Editing is author-only — unlike delete, a moderator silently rewriting
  // someone else's words isn't the same kind of override as removing them.
  async editComment(actor, id, commentId, body) {
    await this.getAccessible(actor, id);
    const comment = await this.commentRepo.findById(commentId);
    if (!comment || comment.deletedAt || comment.bugId !== id) {
      throw new AppError("Comment not found", 404);
    }
    if (comment.authorId !== actor.id) {
      throw new AppError("You can only edit your own comments", 403);
    }
    await this.commentRepo.updateBody(commentId, body);
    return this.commentRepo.findById(commentId);
  }

  // reaction: "like" | "dislike" | null. Same access bar as posting a comment.
  async setCommentReaction(actor, id, commentId, reaction) {
    const bug = await this.getAccessible(actor, id);
    await this.projectService.assertCanContribute(actor, bug.projectId);
    const comment = await this.commentRepo.findById(commentId);
    if (!comment || comment.deletedAt || comment.bugId !== id) {
      throw new AppError("Comment not found", 404);
    }
    await this.commentRepo.setReaction(commentId, actor.id, reaction);
    return this.commentRepo.findById(commentId);
  }
}

module.exports = { BugService };
