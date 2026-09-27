// modules/bug/controllers/bug.controller.js
const { BugService } = require("../services/bug.service");
const { ApiResponse } = require("../../../shared/response/apiResponse");
const { toBugResponse, toBugTimelineResponse, toCommentResponse } = require("../dto/bug.dto");

class BugController {
  static async history(req, res, next) {
    try {
      const rows = await BugService.Instance.getStatusTimeline(req.user, req.validated.params.id);
      res.status(200).json(ApiResponse.ok("Bug timeline fetched", toBugTimelineResponse(rows)));
    } catch (err) {
      next(err);
    }
  }

  static async fetchAll(req, res, next) {
    try {
      const result = await BugService.Instance.fetchBugs(req.user, req.validated.query);
      res
        .status(200)
        .json(ApiResponse.ok("Bugs fetched", result.data.map(toBugResponse), result.meta));
    } catch (err) {
      next(err);
    }
  }

  static async fetchById(req, res, next) {
    try {
      const bug = await BugService.Instance.getBug(req.user, req.validated.params.id);
      res.status(200).json(ApiResponse.ok("Bug fetched", toBugResponse(bug)));
    } catch (err) {
      next(err);
    }
  }

  static async fetchByCode(req, res, next) {
    try {
      const bug = await BugService.Instance.getBugByCode(req.user, req.validated.params.code);
      res.status(200).json(ApiResponse.ok("Bug fetched", toBugResponse(bug)));
    } catch (err) {
      next(err);
    }
  }

  static async create(req, res, next) {
    try {
      const bug = await BugService.Instance.createBug(req.user, req.validated.body);
      res.status(201).json(ApiResponse.created("Bug reported", toBugResponse(bug)));
    } catch (err) {
      next(err);
    }
  }

  static async manage(req, res, next) {
    try {
      const bug = await BugService.Instance.manageBug(
        req.user,
        req.validated.params.id,
        req.validated.body
      );
      res.status(200).json(ApiResponse.ok("Bug updated", toBugResponse(bug)));
    } catch (err) {
      next(err);
    }
  }

  static async remove(req, res, next) {
    try {
      await BugService.Instance.deleteBug(req.user, req.validated.params.id);
      res.status(200).json(ApiResponse.ok("Bug deleted", null));
    } catch (err) {
      next(err);
    }
  }

  static async fetchComments(req, res, next) {
    try {
      const result = await BugService.Instance.fetchComments(
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
      const comment = await BugService.Instance.addComment(
        req.user,
        req.validated.params.id,
        req.validated.body.body,
        req.validated.body.parentId
      );
      res.status(201).json(ApiResponse.created("Comment added", toCommentResponse(comment, req.user.id)));
    } catch (err) {
      next(err);
    }
  }

  static async editComment(req, res, next) {
    try {
      const comment = await BugService.Instance.editComment(
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
      await BugService.Instance.deleteComment(
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
      const comment = await BugService.Instance.setCommentReaction(
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

module.exports = { BugController };
