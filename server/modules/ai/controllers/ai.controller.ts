// modules/ai/controllers/ai.controller.ts
// AI status, the assistant's draft endpoints and the usage report. Thin:
// validated input in, service call, envelope out.
import { AiService } from "../services/ai.service";
import { TicketDraftService } from "../services/ticketDraft.service";
import { AiUsageService } from "../services/aiUsage.service";

const { ApiResponse } = require("../../../shared/response/apiResponse");

export class AiController {
  static async bugReportDraft(req: any, res: any, next: any) {
    try {
      const data = await TicketDraftService.Instance.bugReport(req.user, req.validated.body);
      res.status(200).json(ApiResponse.ok("Bug report drafted", data));
    } catch (err) {
      next(err);
    }
  }

  static async featureRequestDraft(req: any, res: any, next: any) {
    try {
      const data = await TicketDraftService.Instance.featureRequest(req.user, req.validated.body);
      res.status(200).json(ApiResponse.ok("Feature request drafted", data));
    } catch (err) {
      next(err);
    }
  }

  static async usage(req: any, res: any, next: any) {
    try {
      const data = await AiUsageService.Instance.report(req.user, req.validated.query.days);
      res.status(200).json(ApiResponse.ok("AI usage", data));
    } catch (err) {
      next(err);
    }
  }

  static async status(req: any, res: any, next: any) {
    try {
      const data = await AiService.Instance.status(req.user, req.validated.query.feature);
      res.status(200).json(ApiResponse.ok("AI status", data));
    } catch (err) {
      next(err);
    }
  }
}
