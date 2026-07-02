// modules/featureRequest/services/featureRequest.service.js
const { FeatureRequestRepository } = require("../repositories/featureRequest.repository");
const { FeatureRequestVoteRepository } = require("../repositories/featureRequestVote.repository");
const {
  FeatureRequestCommentRepository,
} = require("../repositories/featureRequestComment.repository");
const { AuthRepository } = require("../../auth/repositories/auth.repository");
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
    notificationService = NotificationService.Instance
  ) {
    this.frRepo = frRepo;
    this.voteRepo = voteRepo;
    this.commentRepo = commentRepo;
    this.authRepo = authRepo;
    this.notificationService = notificationService;
  }

  canManage(actor) {
    return actor.role === UserRole.ADMIN || actor.role === UserRole.SUPERADMIN;
  }

  // Annotates a page of requests with the current actor's vote state + comment counts.
  async annotate(actor, requests) {
    if (requests.length === 0) return [];
    const ids = requests.map((r) => r.id);
    const [votedSet, commentCounts] = await Promise.all([
      this.voteRepo.votedSetForUser(ids, actor.id),
      this.frRepo.commentCounts(ids),
    ]);
    return requests.map((r) => ({
      request: r,
      extra: {
        hasVoted: votedSet.has(r.id),
        commentCount: commentCounts.get(r.id) ?? 0,
      },
    }));
  }

  async fetchFeatureRequests(actor, params) {
    const { data, meta } = await this.frRepo.fetchPaginated(params);
    const annotated = await this.annotate(actor, data);
    return { data: annotated, meta };
  }

  async getFeatureRequest(actor, id) {
    const fr = await this.frRepo.findById(id);
    if (!fr || fr.deletedAt) throw new AppError("Feature request not found", 404);
    const [{ extra }] = await this.annotate(actor, [fr]);
    return { request: fr, extra };
  }

  async createFeatureRequest(actor, data) {
    const fr = await this.frRepo.create({
      title: data.title,
      description: data.description,
      category: data.category ?? null,
      status: FeatureRequestStatus.NEW,
      submittedById: actor.id,
      organizationId: actor.organizationId ?? null,
    });

    ActivityService.Instance.log(actor, {
      action: "feature_request.created",
      summary: `Submitted feature request "${fr.title}"`,
      entityType: "feature_request",
      entityId: fr.id,
    });

    Promise.all([this.authRepo.findByRole(UserRole.SUPERADMIN), this.authRepo.findUserById(actor.id)])
      .then(([superadmins, submitter]) => {
        if (superadmins.length) {
          const submittedByName = submitter
            ? [submitter.firstName, submitter.lastName].filter(Boolean).join(" ")
            : "A user";
          this.notificationService.notifyNewFeatureRequest(superadmins, {
            requestId: fr.id,
            title: fr.title,
            submittedByName,
          });
        }
      })
      .catch((e) => console.error("[featureRequest] new-request notify failed:", e.message));

    return fr;
  }

  async updateStatus(actor, id, data) {
    const fr = await this.frRepo.findById(id);
    if (!fr || fr.deletedAt) throw new AppError("Feature request not found", 404);

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
    const fr = await this.frRepo.findById(id);
    if (!fr || fr.deletedAt) throw new AppError("Feature request not found", 404);
    await this.frRepo.softDelete(id);
    ActivityService.Instance.log(actor, {
      action: "feature_request.deleted",
      summary: `Deleted feature request "${fr.title}"`,
      entityType: "feature_request",
      entityId: fr.id,
    });
  }

  async toggleVote(actor, id) {
    const fr = await this.frRepo.findById(id);
    if (!fr || fr.deletedAt) throw new AppError("Feature request not found", 404);
    return this.voteRepo.toggle(id, actor.id);
  }

  async fetchComments(actor, id, params) {
    const fr = await this.frRepo.findById(id);
    if (!fr || fr.deletedAt) throw new AppError("Feature request not found", 404);
    return this.commentRepo.fetchPaginated(id, params);
  }

  async addComment(actor, id, body) {
    const fr = await this.frRepo.findById(id);
    if (!fr || fr.deletedAt) throw new AppError("Feature request not found", 404);

    const comment = await this.commentRepo.create({
      featureRequestId: id,
      authorId: actor.id,
      body,
    });

    if (fr.submittedById && fr.submittedById !== actor.id) {
      Promise.all([this.authRepo.findUserById(fr.submittedById), this.authRepo.findUserById(actor.id)])
        .then(([submitter, commenter]) => {
          if (submitter) {
            const commenterName = commenter
              ? [commenter.firstName, commenter.lastName].filter(Boolean).join(" ")
              : "Someone";
            this.notificationService.notifyFeatureRequestComment(submitter, {
              requestId: fr.id,
              title: fr.title,
              commenterName,
            });
          }
        })
        .catch((e) => console.error("[featureRequest] comment notify failed:", e.message));
    }

    return this.commentRepo.findById(comment.id);
  }

  async deleteComment(actor, id, commentId) {
    const comment = await this.commentRepo.findById(commentId);
    if (!comment || comment.deletedAt || comment.featureRequestId !== id) {
      throw new AppError("Comment not found", 404);
    }
    if (comment.authorId !== actor.id && !this.canManage(actor)) {
      throw new AppError("You can only delete your own comments", 403);
    }
    await this.commentRepo.softDelete(commentId);
  }
}

module.exports = { FeatureRequestService };
