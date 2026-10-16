// modules/ai/controllers/aiCredit.controller.ts
// AI credits: the caller's own balance and history, and the org admin's
// accounts list, grants and prices.
import { AiCreditService } from "../services/aiCredit.service";

const { ApiResponse } = require("../../../shared/response/apiResponse");

export class AiCreditController {
  static async mine(req: any, res: any, next: any) {
    try {
      const { data, meta } = await AiCreditService.Instance.mine(req.user, req.validated.query);
      res.status(200).json(ApiResponse.ok("AI credits", data, meta));
    } catch (err) {
      next(err);
    }
  }

  static async clearHistory(req: any, res: any, next: any) {
    try {
      const dryRun = req.validated.body.dryRun === true;
      const data = await AiCreditService.Instance.clearHistory(req.user, dryRun);
      res.status(200).json(ApiResponse.ok(dryRun ? "Entries that would be cleared" : "History cleared", data));
    } catch (err) {
      next(err);
    }
  }

  static async accounts(req: any, res: any, next: any) {
    try {
      const { data, meta } = await AiCreditService.Instance.accounts(req.user, req.validated.query);
      res.status(200).json(ApiResponse.ok("AI credit balances", data, meta));
    } catch (err) {
      next(err);
    }
  }

  static async grant(req: any, res: any, next: any) {
    try {
      const data = await AiCreditService.Instance.grant(req.user, req.validated.body);
      res.status(200).json(ApiResponse.ok("Credits updated", data));
    } catch (err) {
      next(err);
    }
  }

  static async prices(req: any, res: any, next: any) {
    try {
      const data = await AiCreditService.Instance.prices(req.user);
      res.status(200).json(ApiResponse.ok("AI credit prices", data));
    } catch (err) {
      next(err);
    }
  }

  static async updatePrices(req: any, res: any, next: any) {
    try {
      const data = await AiCreditService.Instance.updatePrices(req.user, req.validated.body.prices);
      res.status(200).json(ApiResponse.ok("AI credit prices updated", data));
    } catch (err) {
      next(err);
    }
  }
}
