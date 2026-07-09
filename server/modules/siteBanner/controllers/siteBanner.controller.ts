// modules/siteBanner/controllers/siteBanner.controller.ts
import { SiteBannerService } from "../services/siteBanner.service";

const { ApiResponse } = require("../../../shared/response/apiResponse");

export class SiteBannerController {
  static async getCurrent(req: any, res: any, next: any) {
    try {
      const banner = await SiteBannerService.Instance.getCurrent(req.user);
      res.status(200).json(ApiResponse.ok("Banner fetched", banner));
    } catch (err) {
      next(err);
    }
  }

  static async activate(req: any, res: any, next: any) {
    try {
      const banner = await SiteBannerService.Instance.activate(req.user.id, req.validated.body);
      res.status(200).json(ApiResponse.ok("Banner activated", banner));
    } catch (err) {
      next(err);
    }
  }

  static async deactivate(req: any, res: any, next: any) {
    try {
      const banner = await SiteBannerService.Instance.deactivate(req.user.id);
      res.status(200).json(ApiResponse.ok("Banner deactivated", banner));
    } catch (err) {
      next(err);
    }
  }
}
