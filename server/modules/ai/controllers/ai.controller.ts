// modules/ai/controllers/ai.controller.ts
// AI status, and (Phase 3) the draft endpoints. Thin: validated input in,
// service call, envelope out.
import { AiService } from "../services/ai.service";
import { BugDescriptionDraftService } from "../services/bugDescriptionDraft.service";

const { ApiResponse } = require("../../../shared/response/apiResponse");

export class AiController {
  static async bugDescriptionDraft(req: any, res: any, next: any) {
    try {
      const data = await BugDescriptionDraftService.Instance.draft(req.user, req.validated.body);
      res.status(200).json(ApiResponse.ok("Description suggested", data));
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
