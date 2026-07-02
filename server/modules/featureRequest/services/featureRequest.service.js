// modules/featureRequest/services/featureRequest.service.js
const { FeatureRequestRepository } = require("../repositories/featureRequest.repository");
const { FeatureRequestVoteRepository } = require("../repositories/featureRequestVote.repository");
const {
  FeatureRequestCommentRepository,
} = require("../repositories/featureRequestComment.repository");
const { AuthRepository } = require("../../auth/repositories/auth.repository");
const { ProjectService } = require("../../project/services/project.service");
const { NotificationService } = require("../../notification/services/notification.service");
const { ActivityService } = require("../../activity/services/activity.service");
const { AppError } = require("../../../shared/errors/AppError");
const { UserRole, FeatureRequestStatus } = require("../../../config/constants");

class FeatureRequestService {
  static Instance = new FeatureRequestService();

  constructor(
    frRepo = FeatureRequestRepository.Instance,
    voteRepo = FeatureRequestVoteRepository.Instance,
    commentRepo = FeatureRequestCommentRepository.Instance,
    authRepo = AuthRepository.Instance,
    notificationService = NotificationService.Instance,
    projectService = ProjectService.Instance
  ) {
    this.frRepo = frRepo;
    this.voteRepo = voteRepo;
    this.commentRepo = commentRepo;
    this.authRepo = authRepo;
    this.notificationService = notificationService;
    this.projectService = projectService;
  }

  canManage(actor) {
    return actor.role === UserRole.ADMIN || actor.role === UserRole.SUPERADMIN;
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

  async createFeatureRequest(actor, data) {
    const project = await this.projectService.getProject(actor, data.projectId);

    const fr = await this.frRepo.create({
      projectId: data.projectId,
      title: data.title,
      description: data.description,
      category: data.category ?? null,
      status: FeatureRequestStatus.NEW,
      submittedById: actor.id,
    });

    ActivityService.Instance.log(actor, {
      action: "feature_request.created",
      summary: `Submitted feature request "${fr.title}"`,
      entityType: "feature_request",
      entityId: fr.id,
    });

    // Notify superadmins (platform-wide oversight) + the project's own org admins —
    // mirrors ProjectService.assertAccess's access model.
    Promise.all([
      this.authRepo.findByRole(UserRole.SUPERADMIN),
      project.organizationId
        ? this.authRepo.findByRoleAndOrg(UserRole.ADMIN, project.organizationId)
        : Promise.resolve([]),
      this.authRepo.findUserById(actor.id),
    ])
      .then(([superadmins, orgAdmins, submitter]) => {
        const recipients = [...new Map([...superadmins, ...orgAdmins].map((u) => [u.id, u])).values()];
        if (recipients.length) {
          const submittedByName = submitter
            ? [submitter.firstName, submitter.lastName].filter(Boolean).join(" ")
            : "A user";
          this.notificationService.notifyNewFeatureRequest(recipients, {
            requestId: fr.id,
            projectId: fr.projectId,
            title: fr.title,
            submittedByName,
          });
        }
      })
      .catch((e) => console.error("[featureRequest] new-request notify failed:", e.message));

    return fr;
  }

  async updateStatus(actor, id, data) {
    const fr = await this.getAccessible(actor, id);

    const patch = {};
    if (data.status !== undefined) {
      patch.status = data.status;
      patch.statusUpdatedAt = new Date();
    }
    if (data.adminResponse !== undefined) patch.adminResponse = data.adminResponse;

    const updated = await this.frRepo.update(id, patch);

    ActivityService.Instance.log(actor, {
      action: "feature_request.status_updated",
      summary: `Updated feature request "${fr.title}" to ${updated.status}`,
      entityType: "feature_request",
      entityId: fr.id,
    });

    if (data.status !== undefined && fr.submittedById && fr.submittedById !== actor.id) {
      this.authRepo
        .findUserById(fr.submittedById)
        .then((submitter) => {
          if (submitter) {
            this.notificationService.notifyFeatureRequestStatusChanged(submitter, {
              requestId: fr.id,
              projectId: fr.projectId,
              title: fr.title,
              status: updated.status,
              adminResponse: updated.adminResponse,
            });
          }
        })
        .catch((e) => console.error("[featureRequest] status notify failed:", e.message));
    }

    return updated;
  }

  async deleteFeatureRequest(actor, id) {
    const fr = await this.getAccessible(actor, id);
    await this.frRepo.softDelete(id);
    ActivityService.Instance.log(actor, {
      action: "feature_request.deleted",
      summary: `Deleted feature request "${fr.title}"`,
      entityType: "feature_request",
      entityId: fr.id,
    });
  }

  async toggleVote(actor, id) {
    await this.getAccessible(actor, id);
    return this.voteRepo.toggle(id, actor.id);
  }

  async fetchComments(actor, id, params) {
    await this.getAccessible(actor, id);
    return this.commentRepo.fetchPaginated(id, params);
  }

  async addComment(actor, id, body) {
    const fr = await this.getAccessible(actor, id);

    // Firestore has no join — the author's display name is denormalized onto the doc.
    const commenter = await this.authRepo.findUserById(actor.id);
    const commenterName = commenter
      ? [commenter.firstName, commenter.lastName].filter(Boolean).join(" ")
      : null;

    const comment = await this.commentRepo.create({
      featureRequestId: id,
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
    await this.getAccessible(actor, id);

    const comment = await this.commentRepo.findById(commentId);
    if (!comment || comment.deletedAt || comment.featureRequestId !== id) {
      throw new AppError("Comment not found", 404);
    }
    if (comment.authorId !== actor.id && !this.canManage(actor)) {
      throw new AppError("You can only delete your own comments", 403);
    }
    await this.commentRepo.softDelete(commentId);
    await this.frRepo.decrementCommentCount(id);
  }
}

module.exports = { FeatureRequestService };
