// modules/feedback/controllers/feedbackSupport.controller.ts
import { FeedbackSupportService } from "../services/feedbackSupport.service";
import { toFeedbackResponse, toFeedbackTimelineResponse } from "../dto/feedback.dto";
import { toSupporterResponse } from "../../clientCompany/dto/clientCompany.dto";

const { ApiResponse } = require("../../../shared/response/apiResponse");

export class FeedbackSupportController {
  static async fetchQueue(req: any, res: any, next: any) {
    try {
      const result = await FeedbackSupportService.Instance.fetchQueue(
        req.user,
        req.validated.query
      );
      res
        .status(200)
        .json(
          ApiResponse.ok("Support queue fetched", result.data.map(toFeedbackResponse), result.meta)
        );
    } catch (err) {
      next(err);
    }
  }

  static async teammates(req: any, res: any, next: any) {
    try {
      const users = await FeedbackSupportService.Instance.listTeammates(req.user);
      res.status(200).json(ApiResponse.ok("Teammates fetched", users.map(toSupporterResponse)));
    } catch (err) {
      next(err);
    }
  }

  static async assign(req: any, res: any, next: any) {
    try {
      const updated = await FeedbackSupportService.Instance.assignToSupporter(
        req.user,
        req.validated.params.id,
        req.validated.body.supporterId
      );
      res.status(200).json(ApiResponse.ok("Ticket assigned", toFeedbackResponse(updated)));
    } catch (err) {
      next(err);
    }
  }

  static async updateStatus(req: any, res: any, next: any) {
    try {
      const updated = await FeedbackSupportService.Instance.updateStatus(
        req.user,
        req.validated.params.id,
        req.validated.body.supportStatus,
        req.validated.body.note
      );
      res
        .status(200)
        .json(ApiResponse.ok("Stage updated — the submitter has been emailed", toFeedbackResponse(updated)));
    } catch (err) {
      next(err);
    }
  }

  static async history(req: any, res: any, next: any) {
    try {
      const rows = await FeedbackSupportService.Instance.getSupportTimeline(
        req.user,
        req.validated.params.id
      );
      res
        .status(200)
        .json(ApiResponse.ok("Support timeline fetched", toFeedbackTimelineResponse(rows as any)));
    } catch (err) {
      next(err);
    }
  }

  static async resolve(req: any, res: any, next: any) {
    try {
      const updated = await FeedbackSupportService.Instance.resolveLocally(
        req.user,
        req.validated.params.id,
        req.validated.body.note
      );
      res
        .status(200)
        .json(
          ApiResponse.ok(
            "Feedback resolved — the submitter's been emailed and asked to confirm",
            toFeedbackResponse(updated)
          )
        );
    } catch (err) {
      next(err);
    }
  }

  static async escalate(req: any, res: any, next: any) {
    try {
      const updated = await FeedbackSupportService.Instance.escalate(
        req.user,
        req.validated.params.id,
        req.validated.body.severity,
        req.validated.body.note
      );
      res
        .status(200)
        .json(ApiResponse.ok("Feedback escalated to the product team", toFeedbackResponse(updated)));
    } catch (err) {
      next(err);
    }
  }

  static async notifySubmitter(req: any, res: any, next: any) {
    try {
      const updated = await FeedbackSupportService.Instance.notifySubmitterFixed(
        req.user,
        req.validated.params.id,
        req.validated.body.note
      );
      res
        .status(200)
        .json(ApiResponse.ok("Submitter notified — they've been emailed", toFeedbackResponse(updated)));
    } catch (err) {
      next(err);
    }
  }
}
