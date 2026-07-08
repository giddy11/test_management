// modules/feedback/controllers/feedback.controller.ts
import { FeedbackService } from "../services/feedback.service";
import { toFeedbackResponse } from "../dto/feedback.dto";

const { ApiResponse } = require("../../../shared/response/apiResponse");

export class FeedbackController {
  // ── Public (unauthenticated) ────────────────────────────────────────────────
  static async publicForm(req: any, res: any, next: any) {
    try {
      const form = await FeedbackService.Instance.getPublicForm(req.validated.params.token);
      res.status(200).json(ApiResponse.ok("Feedback form", form));
    } catch (err) {
      next(err);
    }
  }

  static async publicSubmit(req: any, res: any, next: any) {
    try {
      const files = (req.files ?? []) as { buffer: Buffer }[];
      const result = await FeedbackService.Instance.submitPublic(
        req.validated.params.token,
        req.validated.body,
        files.map((f) => f.buffer)
      );
      res
        .status(201)
        .json(ApiResponse.created("Thanks! Your feedback has been logged.", result));
    } catch (err) {
      next(err);
    }
  }

  // ── Authenticated ───────────────────────────────────────────────────────────
  static async fetchAll(req: any, res: any, next: any) {
    try {
      const result = await FeedbackService.Instance.fetchFeedback(req.user, req.validated.query);
      res
        .status(200)
        .json(ApiResponse.ok("Feedback fetched", result.data.map(toFeedbackResponse), result.meta));
    } catch (err) {
      next(err);
    }
  }

  static async manage(req: any, res: any, next: any) {
    try {
      const updated = await FeedbackService.Instance.manageFeedback(
        req.user,
        req.validated.params.id,
        req.validated.body
      );
      res.status(200).json(ApiResponse.ok("Feedback updated", toFeedbackResponse(updated)));
    } catch (err) {
      next(err);
    }
  }

  static async setLink(req: any, res: any, next: any) {
    try {
      const result = await FeedbackService.Instance.setFeedbackLink(
        req.user,
        req.validated.params.id,
        req.validated.body.enabled
      );
      res.status(200).json(ApiResponse.ok("Feedback link updated", result));
    } catch (err) {
      next(err);
    }
  }
}
