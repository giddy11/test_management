// modules/ai/controllers/ai.controller.ts
// AI status, and (Phase 3) the draft endpoints. Thin: validated input in,
// service call, envelope out.
import { AiService } from "../services/ai.service";

const { ApiResponse } = require("../../../shared/response/apiResponse");

export class AiController {
  static async status(req: any, res: any, next: any) {
    try {
      const data = await AiService.Instance.status(req.user, req.validated.query.feature);
      res.status(200).json(ApiResponse.ok("AI status", data));
    } catch (err) {
      next(err);
    }
  }
}
