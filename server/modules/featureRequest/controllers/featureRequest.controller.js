// modules/featureRequest/controllers/featureRequest.controller.js
const { FeatureRequestService } = require("../services/featureRequest.service");
const { ApiResponse } = require("../../../shared/response/apiResponse");
const {
  toFeatureRequestResponse,
  toCommentResponse,
  toStatusTimelineResponse,
} = require("../dto/featureRequest.dto");

class FeatureRequestController {
  static async history(req, res, next) {
    try {
      const rows = await FeatureRequestService.Instance.getStatusTimeline(
        req.user,
        req.validated.params.id
      );
      res
        .status(200)
        .json(ApiResponse.ok("Feature request timeline fetched", toStatusTimelineResponse(rows)));
    } catch (err) {
      next(err);
    }
  }

  static async fetchAll(req, res, next) {
    try {
      const result = await FeatureRequestService.Instance.fetchFeatureRequests(
        req.user,
        req.validated.query
      );
      res.status(200).json(
        ApiResponse.ok(
          "Feature requests fetched",
          result.data.map(({ request, extra }) => toFeatureRequestResponse(request, extra)),
          result.meta
        )
      );
    } catch (err) {
      next(err);
    }
  }

  static async fetchById(req, res, next) {
    try {
      const { request, extra } = await FeatureRequestService.Instance.getFeatureRequest(
        req.user,
        req.validated.params.id
      );
      res
        .status(200)
        .json(ApiResponse.ok("Feature request fetched", toFeatureRequestResponse(request, extra)));
    } catch (err) {
      next(err);
    }
  }

  static async fetchByCode(req, res, next) {
    try {
      const { request, extra } = await FeatureRequestService.Instance.getFeatureRequestByCode(
        req.user,
        req.validated.params.code
      );
      res
        .status(200)
        .json(ApiResponse.ok("Feature request fetched", toFeatureRequestResponse(request, extra)));
    } catch (err) {
      next(err);
    }
  }

  static async create(req, res, next) {
    try {
      const fr = await FeatureRequestService.Instance.createFeatureRequest(
        req.user,
        req.validated.body
      );
      res
        .status(201)
        .json(ApiResponse.created("Feature request submitted", toFeatureRequestResponse(fr)));
    } catch (err) {
      next(err);
    }
  }

  static async updateStatus(req, res, next) {
    try {
      const fr = await FeatureRequestService.Instance.updateStatus(
        req.user,
        req.validated.params.id,
        req.validated.body
      );
      res.status(200).json(ApiResponse.ok("Feature request updated", toFeatureRequestResponse(fr)));
    } catch (err) {
      next(err);
    }
  }

  static async remove(req, res, next) {
    try {
      await FeatureRequestService.Instance.deleteFeatureRequest(req.user, req.validated.params.id);
      res.status(200).json(ApiResponse.ok("Feature request deleted", null));
    } catch (err) {
      next(err);
    }
  }

  static async vote(req, res, next) {
    try {
      const result = await FeatureRequestService.Instance.toggleVote(
        req.user,
        req.validated.params.id
      );
      res.status(200).json(ApiResponse.ok("Vote updated", result));
    } catch (err) {
      next(err);
    }
  }

  static async fetchComments(req, res, next) {
    try {
      const result = await FeatureRequestService.Instance.fetchComments(
        req.user,
        req.validated.params.id,
        req.validated.query
      );
      res
        .status(200)
        .json(
          ApiResponse.ok(
            "Comments fetched",
            result.data.map((c) => toCommentResponse(c, req.user.id)),
            result.meta
          )
        );
    } catch (err) {
      next(err);
    }
  }

  static async addComment(req, res, next) {
    try {
      const comment = await FeatureRequestService.Instance.addComment(
        req.user,
        req.validated.params.id,
        req.validated.body.body,
        req.validated.body.parentId,
        req.validated.body.mentionedUserIds
      );
      res.status(201).json(ApiResponse.created("Comment added", toCommentResponse(comment, req.user.id)));
    } catch (err) {
      next(err);
    }
  }

  static async editComment(req, res, next) {
    try {
      const comment = await FeatureRequestService.Instance.editComment(
        req.user,
        req.validated.params.id,
        req.validated.params.commentId,
        req.validated.body.body
      );
      res.status(200).json(ApiResponse.ok("Comment updated", toCommentResponse(comment, req.user.id)));
    } catch (err) {
      next(err);
    }
  }

  static async removeComment(req, res, next) {
    try {
      await FeatureRequestService.Instance.deleteComment(
        req.user,
        req.validated.params.id,
        req.validated.params.commentId
      );
      res.status(200).json(ApiResponse.ok("Comment deleted", null));
    } catch (err) {
      next(err);
    }
  }

  static async setCommentReaction(req, res, next) {
    try {
      const comment = await FeatureRequestService.Instance.setCommentReaction(
        req.user,
        req.validated.params.id,
        req.validated.params.commentId,
        req.validated.body.reaction
      );
      res
        .status(200)
        .json(ApiResponse.ok("Reaction updated", toCommentResponse(comment, req.user.id)));
    } catch (err) {
      next(err);
    }
  }
}

module.exports = { FeatureRequestController };
