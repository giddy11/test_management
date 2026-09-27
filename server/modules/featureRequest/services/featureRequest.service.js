// modules/featureRequest/services/featureRequest.service.js
const { FeatureRequestRepository } = require("../repositories/featureRequest.repository");
const {
  FeatureRequestStatusHistoryRepository,
} = require("../repositories/featureRequestStatusHistory.repository");
const { FeatureRequestVoteRepository } = require("../repositories/featureRequestVote.repository");
const {
  FeatureRequestCommentRepository,
} = require("../repositories/featureRequestComment.repository");
const { AuthRepository } = require("../../auth/repositories/auth.repository");
const { ProjectService } = require("../../project/services/project.service");
const { NotificationService } = require("../../notification/services/notification.service");
const { ActivityService } = require("../../activity/services/activity.service");
const {
  ProjectMemberRepository,
} = require("../../project/repositories/projectMember.repository");
const { AppError } = require("../../../shared/errors/AppError");
const { parseReferenceCode } = require("../../../shared/utils/referenceCode");
const { UserRole, FeatureRequestStatus } = require("../../../config/constants");

// done/rejected are the workflow's two terminal states — SLA "resolved".
const TERMINAL_FEATURE_REQUEST_STATUSES = new Set([
  FeatureRequestStatus.DONE,
  FeatureRequestStatus.REJECTED,
]);

// The workflow's stages in order. "rejected" isn't one of them: a request can be
// rejected from any open stage, so it has no place in the sequence.
const FEATURE_REQUEST_STAGES = [
  FeatureRequestStatus.NEW,
  FeatureRequestStatus.UNDER_REVIEW,
  FeatureRequestStatus.PLANNED,
  FeatureRequestStatus.IN_PROGRESS,
  FeatureRequestStatus.DONE,
];

const FEATURE_REQUEST_STATUS_LABELS = {
  [FeatureRequestStatus.NEW]: "New",
  [FeatureRequestStatus.UNDER_REVIEW]: "Under Review",
  [FeatureRequestStatus.PLANNED]: "Planned",
  [FeatureRequestStatus.IN_PROGRESS]: "In Progress",
  [FeatureRequestStatus.DONE]: "Done",
  [FeatureRequestStatus.REJECTED]: "Rejected",
};

// A request only moves forward — it can't return to an earlier stage, and done
// and rejected are final. Skipping ahead is allowed, and so is rejecting from any
// open stage. Keeping the current status is always fine (e.g. to edit the response).
// Mirrored on the client in isFeatureRequestStatusSelectable (lib/enums.ts).
function assertValidStatusTransition(current, next) {
  if (current === next) return;
  if (TERMINAL_FEATURE_REQUEST_STATUSES.has(current)) {
    throw new AppError(
      `This request is already ${FEATURE_REQUEST_STATUS_LABELS[current]} — its status can't change any more.`,
      422
    );
  }
  if (next === FeatureRequestStatus.REJECTED) return;
  if (FEATURE_REQUEST_STAGES.indexOf(next) < FEATURE_REQUEST_STAGES.indexOf(current)) {
    throw new AppError(
      `A feature request can't go back to an earlier status — it is already "${FEATURE_REQUEST_STATUS_LABELS[current]}".`,
      422
    );
  }
}

class FeatureRequestService {
  static Instance = new FeatureRequestService();

  constructor(
    frRepo = FeatureRequestRepository.Instance,
    voteRepo = FeatureRequestVoteRepository.Instance,
    commentRepo = FeatureRequestCommentRepository.Instance,
    authRepo = AuthRepository.Instance,
    notificationService = NotificationService.Instance,
    projectService = ProjectService.Instance,
    memberRepo = ProjectMemberRepository.Instance,
    historyRepo = FeatureRequestStatusHistoryRepository.Instance
  ) {
    this.frRepo = frRepo;
    this.voteRepo = voteRepo;
    this.commentRepo = commentRepo;
    this.authRepo = authRepo;
    this.notificationService = notificationService;
    this.projectService = projectService;
    this.memberRepo = memberRepo;
    this.historyRepo = historyRepo;
  }

  // Fetches the request, 404s if missing/deleted, then checks project access —
  // same "check access via parent" pattern as TestSuiteService.getTestSuite.
  async getAccessible(actor, id) {
    const fr = await this.frRepo.findById(id);
    if (!fr || fr.deletedAt) throw new AppError("Feature request not found", 404);
    await this.projectService.getProject(actor, fr.projectId);
    return fr;
  }

  // Annotates a page of requests with the current actor's vote state. commentCount
  // is a denormalized column on the row itself (comments live in Firestore).
  async annotate(actor, requests) {
    if (requests.length === 0) return [];
    const ids = requests.map((r) => r.id);
    const votedSet = await this.voteRepo.votedSetForUser(ids, actor.id);
    return requests.map((r) => ({
      request: r,
      extra: {
        hasVoted: votedSet.has(r.id),
        commentCount: r.commentCount ?? 0,
      },
    }));
  }

  async fetchFeatureRequests(actor, params) {
    await this.projectService.getProject(actor, params.projectId);
    const { data, meta } = await this.frRepo.fetchPaginated(params);
    const annotated = await this.annotate(actor, data);
    return { data: annotated, meta };
  }

  async getFeatureRequest(actor, id) {
    const fr = await this.getAccessible(actor, id);
    const [{ extra }] = await this.annotate(actor, [fr]);
    return { request: fr, extra };
  }

  // Same as getFeatureRequest but resolves via the human-readable reference
  // code (e.g. "FR-014") instead of the uuid — backs the /by-code deep link
  // used by the "share link" button on the feature request detail page.
  async getFeatureRequestByCode(actor, code) {
    const requestNumber = parseReferenceCode("FR", code);
    if (requestNumber == null) throw new AppError("Feature request not found", 404);
    const fr = await this.frRepo.findByNumber(requestNumber);
    if (!fr || fr.deletedAt) throw new AppError("Feature request not found", 404);
    await this.projectService.getProject(actor, fr.projectId);
    const [{ extra }] = await this.annotate(actor, [fr]);
    return { request: fr, extra };
  }

  // Every status the request has entered, oldest first.
  async getStatusTimeline(actor, id) {
    await this.getAccessible(actor, id);
    return this.historyRepo.findByFeatureRequest(id);
  }

  async createFeatureRequest(actor, data) {
    const project = await this.projectService.getProject(actor, data.projectId);
    await this.projectService.assertCanContribute(actor, data.projectId);

    const fr = await this.frRepo.create({
      projectId: data.projectId,
      title: data.title,
      description: data.description,
      category: data.category ?? null,
      module: data.module ?? null,
      referenceLinks: data.referenceLinks ?? null,
      status: FeatureRequestStatus.NEW,
      submittedById: actor.id,
    });

    // First entry in the SLA "paused time" timeline — same pattern as
    // FeedbackService seeding feedback_status_history on creation.
    this.historyRepo
      .create({ featureRequestId: fr.id, status: FeatureRequestStatus.NEW, enteredAt: fr.createdAt })
      .catch((e) => console.error("[featureRequest] history entry failed:", e.message));

    ActivityService.Instance.log(actor, {
      action: "feature_request.created",
      summary: `Submitted feature request "${fr.title}" in project "${project.name}"`,
      entityType: "feature_request",
      entityId: fr.id,
      metadata: { projectId: fr.projectId },
    });

    // Notify the project's own org admins + the project's members — this is
    // company-operational data, so superadmins (platform-wide oversight) are
    // deliberately excluded. The submitter gets nothing — no in-app, no email —
    // they know what they just submitted.
    Promise.all([
      project.organizationId
        ? this.authRepo.findByRoleAndOrg(UserRole.ADMIN, project.organizationId)
        : Promise.resolve([]),
      this.authRepo.findUserById(actor.id),
      this.memberRepo.findMemberUsers(fr.projectId),
    ])
      .then(([orgAdmins, submitter, members]) => {
        const recipients = [
          ...new Map(
            [...orgAdmins, ...members]
              .filter((u) => u.id !== actor.id)
              .map((u) => [u.id, u])
          ).values(),
        ];
        if (recipients.length) {
          const submittedByName = submitter
            ? [submitter.firstName, submitter.lastName].filter(Boolean).join(" ")
            : "A user";
          this.notificationService.notifyNewFeatureRequest(recipients, {
            requestId: fr.id,
            projectId: fr.projectId,
            title: fr.title,
            submittedByName,
            organizationId: project.organizationId,
          });
        }
      })
      .catch((e) => console.error("[featureRequest] new-request notify failed:", e.message));

    return fr;
  }

  async updateStatus(actor, id, data) {
    const fr = await this.getAccessible(actor, id);
    // Editing a request and deciding its fate (planned, done, rejected) are both
    // the project's team lead's call.
    await this.projectService.assertCanManageProject(actor, fr.projectId);

    const patch = {};
    if (data.status !== undefined) assertValidStatusTransition(fr.status, data.status);
    // Only a real move counts as a transition — resending the current status
    // alongside a reply must not stamp a first response or reset statusUpdatedAt.
    const statusChanged = data.status !== undefined && data.status !== fr.status;
    if (statusChanged) {
      patch.status = data.status;
      patch.statusUpdatedAt = new Date();
      // done/rejected are both terminal — there's no separate "closed" step,
      // so resolvedAt and closedAt are set together. Terminal is final (see
      // assertValidStatusTransition), so they're never cleared again.
      if (TERMINAL_FEATURE_REQUEST_STATUSES.has(data.status) && !fr.resolvedAt) {
        patch.resolvedAt = patch.statusUpdatedAt;
        patch.closedAt = patch.statusUpdatedAt;
      }
    }
    if (data.adminResponse !== undefined) patch.adminResponse = data.adminResponse;
    // The first response is the first status move or the first written staff
    // reply — an admin answering a request while leaving it "new" has responded.
    const staffReplied = typeof data.adminResponse === "string" && data.adminResponse.trim() !== "";
    if ((statusChanged || staffReplied) && !fr.firstResponseAt) {
      patch.firstResponseAt = patch.statusUpdatedAt ?? new Date();
    }

    const updated = await this.frRepo.update(id, patch);
    const project = await this.projectService.getProject(actor, fr.projectId);

    // One history row per status entered — powers the SLA "paused time"
    // calculation and a timeline, same as FeedbackService.
    if (patch.status && patch.status !== fr.status) {
      this.historyRepo
        .create({ featureRequestId: fr.id, status: patch.status, enteredAt: patch.statusUpdatedAt })
        .catch((e) => console.error("[featureRequest] history entry failed:", e.message));
    }

    ActivityService.Instance.log(actor, {
      action: "feature_request.status_updated",
      summary: `Updated feature request "${fr.title}" to ${updated.status} in project "${project.name}"`,
      entityType: "feature_request",
      entityId: fr.id,
      metadata: { projectId: fr.projectId },
    });

    // Status changes fan out to the submitter + every project member (in-app +
    // email), excluding whoever made the change.
    if (data.status !== undefined) {
      Promise.all([
        fr.submittedById ? this.authRepo.findUserById(fr.submittedById) : Promise.resolve(null),
        this.memberRepo.findMemberUsers(fr.projectId),
      ])
        .then(([submitter, members]) => {
          const pool = [...members];
          if (submitter) pool.push(submitter);
          const recipients = [
            ...new Map(pool.filter((u) => u.id !== actor.id).map((u) => [u.id, u])).values(),
          ];
          if (recipients.length) {
            this.notificationService.notifyFeatureRequestStatusChanged(recipients, {
              requestId: fr.id,
              projectId: fr.projectId,
              title: fr.title,
              status: updated.status,
              adminResponse: updated.adminResponse,
              submittedById: fr.submittedById,
              organizationId: project.organizationId,
            });
          }
        })
        .catch((e) => console.error("[featureRequest] status notify failed:", e.message));
    }

    return updated;
  }

  async deleteFeatureRequest(actor, id) {
    const fr = await this.getAccessible(actor, id);
    const project = await this.projectService.getProject(actor, fr.projectId);
    await this.projectService.assertCanManageProject(actor, project.id);
    await this.frRepo.softDelete(id);
    ActivityService.Instance.log(actor, {
      action: "feature_request.deleted",
      summary: `Deleted feature request "${fr.title}" in project "${project.name}"`,
      entityType: "feature_request",
      entityId: fr.id,
      metadata: { projectId: fr.projectId },
    });
  }

  async toggleVote(actor, id) {
    const fr = await this.getAccessible(actor, id);
    await this.projectService.assertCanContribute(actor, fr.projectId);
    return this.voteRepo.toggle(id, actor.id);
  }

  async fetchComments(actor, id, params) {
    await this.getAccessible(actor, id);
    return this.commentRepo.fetchPaginated(id, params);
  }

  // A reply always threads under a root comment: replying to a reply resolves
  // to that reply's own parent, so there's never a third level to render.
  async _resolveParentId(featureRequestId, parentId) {
    if (!parentId) return null;
    const parent = await this.commentRepo.findById(parentId);
    if (!parent || parent.featureRequestId !== featureRequestId) {
      throw new AppError("Comment not found", 404);
    }
    return parent.parentId ?? parent.id;
  }

  async addComment(actor, id, body, parentId) {
    const fr = await this.getAccessible(actor, id);
    await this.projectService.assertCanContribute(actor, fr.projectId);
    const resolvedParentId = await this._resolveParentId(id, parentId);

    // Firestore has no join — the author's display name is denormalized onto the doc.
    const commenter = await this.authRepo.findUserById(actor.id);
    const commenterName = commenter
      ? [commenter.firstName, commenter.lastName].filter(Boolean).join(" ")
      : null;

    const comment = await this.commentRepo.create({
      featureRequestId: id,
      parentId: resolvedParentId,
      authorId: actor.id,
      authorName: commenterName,
      body,
    });

    // Firestore write and Postgres counter update aren't in one transaction (different
    // databases) — accepted eventual-consistency tradeoff, same as the notify calls below.
    await this.frRepo.incrementCommentCount(id);

    if (fr.submittedById && fr.submittedById !== actor.id) {
      this.authRepo
        .findUserById(fr.submittedById)
        .then((submitter) => {
          if (submitter) {
            this.notificationService.notifyFeatureRequestComment(submitter, {
              requestId: fr.id,
              projectId: fr.projectId,
              title: fr.title,
              commenterName: commenterName || "Someone",
            });
          }
        })
        .catch((e) => console.error("[featureRequest] comment notify failed:", e.message));
    }

    return comment;
  }

  async deleteComment(actor, id, commentId) {
    const fr = await this.getAccessible(actor, id);

    const comment = await this.commentRepo.findById(commentId);
    if (!comment || comment.deletedAt || comment.featureRequestId !== id) {
      throw new AppError("Comment not found", 404);
    }
    if (
      comment.authorId !== actor.id &&
      !(await this.projectService.canManageProject(actor, fr.projectId))
    ) {
      throw new AppError("You can only delete your own comments", 403);
    }
    if (await this.commentRepo.hasReplies(commentId)) {
      throw new AppError("This comment has replies — delete those first", 422);
    }
    await this.commentRepo.softDelete(commentId);
    await this.frRepo.decrementCommentCount(id);
  }

  // Editing is author-only — unlike delete, a moderator silently rewriting
  // someone else's words isn't the same kind of override as removing them.
  async editComment(actor, id, commentId, body) {
    await this.getAccessible(actor, id);
    const comment = await this.commentRepo.findById(commentId);
    if (!comment || comment.deletedAt || comment.featureRequestId !== id) {
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
    const fr = await this.getAccessible(actor, id);
    await this.projectService.assertCanContribute(actor, fr.projectId);
    const comment = await this.commentRepo.findById(commentId);
    if (!comment || comment.deletedAt || comment.featureRequestId !== id) {
      throw new AppError("Comment not found", 404);
    }
    await this.commentRepo.setReaction(commentId, actor.id, reaction);
    return this.commentRepo.findById(commentId);
  }
}

module.exports = { FeatureRequestService };
