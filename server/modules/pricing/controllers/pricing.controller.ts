// modules/pricing/controllers/pricing.controller.ts
import { PricingService } from "../services/pricing.service";

const { ApiResponse } = require("../../../shared/response/apiResponse");

export class PricingController {
  static async getPublic(req: any, res: any, next: any) {
    try {
      const content = await PricingService.Instance.getPublic();
      // Same for every visitor; a short cache keeps the landing page cheap.
      res.set("Cache-Control", "public, max-age=60");
      res.status(200).json(ApiResponse.ok("Pricing", content));
    } catch (err) {
      next(err);
    }
  }

  static async get(req: any, res: any, next: any) {
    try {
      const data = await PricingService.Instance.get();
      res.status(200).json(ApiResponse.ok("Pricing", data));
    } catch (err) {
      next(err);
    }
  }

  static async update(req: any, res: any, next: any) {
    try {
      const data = await PricingService.Instance.update(req.user, req.validated.body);
      res.status(200).json(ApiResponse.ok("Pricing saved", data));
    } catch (err) {
      next(err);
    }
  }

  static async reset(req: any, res: any, next: any) {
    try {
      const data = await PricingService.Instance.reset(req.user);
      res.status(200).json(ApiResponse.ok("Pricing reset to defaults", data));
    } catch (err) {
      next(err);
    }
  }
}
