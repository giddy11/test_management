// modules/feedback/controllers/feedback.controller.ts
import { FeedbackService } from "../services/feedback.service";
import { toFeedbackResponse, toFeedbackTimelineResponse } from "../dto/feedback.dto";

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

  // A partner's own dashboard listing everything raised against its form —
  // same token as publicSubmit, paginated.
  static async publicListTickets(req: any, res: any, next: any) {
    try {
      const result = await FeedbackService.Instance.listPublicTickets(
        req.validated.params.token,
        req.validated.query
      );
      res.status(200).json(ApiResponse.ok("Tickets fetched", result.data, result.meta));
    } catch (err) {
      next(err);
    }
  }

  // A submitter's own ticket history, no account — email a code, then trade
  // it for the list (reusable until it expires, so a refresh doesn't need a
  // new one). Never reveals whether the email has tickets.
  static async requestMyTicketsCode(req: any, res: any, next: any) {
    try {
      await FeedbackService.Instance.requestMyTicketsCode(req.validated.body.email);
      res.status(200).json(ApiResponse.ok("If that email has any tickets, a code is on its way", null));
    } catch (err) {
      next(err);
    }
  }

  static async listMyTickets(req: any, res: any, next: any) {
    try {
      const tickets = await FeedbackService.Instance.listMyTickets(
        req.validated.body.email,
        req.validated.body.code
      );
      res.status(200).json(ApiResponse.ok("Tickets fetched", tickets));
    } catch (err) {
      next(err);
    }
  }

  static async submitRating(req: any, res: any, next: any) {
    try {
      const ticket = await FeedbackService.Instance.submitRating(
        req.validated.params.id,
        req.validated.body.email,
        req.validated.body.code,
        req.validated.body.rating
      );
      res.status(200).json(ApiResponse.ok("Thanks for rating!", ticket));
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

  // TestMate's own in-app WhatsApp widget, just before its wa.me hand-off.
  static async testMateSupport(req: any, res: any, next: any) {
    try {
      const result = await FeedbackService.Instance.submitTestMateSupport(req.user, req.validated.body);
      res.status(201).json(ApiResponse.created("Ticket logged", result));
    } catch (err) {
      next(err);
    }
  }

  static async remove(req: any, res: any, next: any) {
    try {
      await FeedbackService.Instance.deleteFeedback(req.user, req.validated.params.id);
      res.status(200).json(ApiResponse.ok("Feedback deleted", null));
    } catch (err) {
      next(err);
    }
  }

  static async history(req: any, res: any, next: any) {
    try {
      const rows = await FeedbackService.Instance.getFeedbackTimeline(
        req.user,
        req.validated.params.id
      );
      res.status(200).json(ApiResponse.ok("Feedback timeline fetched", toFeedbackTimelineResponse(rows)));
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
