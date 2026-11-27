// modules/reviewPrompt/controllers/reviewPrompt.controller.ts
import { ReviewPromptService } from "../services/reviewPrompt.service";

const { ApiResponse } = require("../../../shared/response/apiResponse");

export class ReviewPromptController {
  static async claim(req: any, res: any, next: any) {
    try {
      const data = await ReviewPromptService.Instance.claim(req.user);
      res.status(200).json(ApiResponse.ok("Items awaiting your review", data));
    } catch (err) {
      next(err);
    }
  }

  static async getSettings(_req: any, res: any, next: any) {
    try {
      const data = await ReviewPromptService.Instance.getSettings();
      res.status(200).json(ApiResponse.ok("Review reminder settings", data));
    } catch (err) {
      next(err);
    }
  }

  static async updateSettings(req: any, res: any, next: any) {
    try {
      const data = await ReviewPromptService.Instance.updateSettings(req.user, req.validated.body);
      res.status(200).json(ApiResponse.ok("Review reminder saved", data));
    } catch (err) {
      next(err);
    }
  }
}
