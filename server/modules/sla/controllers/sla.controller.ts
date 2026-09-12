// modules/sla/controllers/sla.controller.ts
import { SlaService } from "../services/sla.service";

const { ApiResponse } = require("../../../shared/response/apiResponse");

export class SlaController {
  static async overview(req: any, res: any, next: any) {
    try {
      const data = await SlaService.Instance.overview(req.user, req.validated.query);
      res.status(200).json(ApiResponse.ok("SLA overview", data));
    } catch (err) {
      next(err);
    }
  }

  static async tickets(req: any, res: any, next: any) {
    try {
      const { data, meta } = await SlaService.Instance.tickets(req.user, req.validated.query);
      res.status(200).json(ApiResponse.ok("SLA tickets", data, meta));
    } catch (err) {
      next(err);
    }
  }

  static async filterOptions(req: any, res: any, next: any) {
    try {
      const data = await SlaService.Instance.filterOptions(req.user);
      res.status(200).json(ApiResponse.ok("SLA filter options", data));
    } catch (err) {
      next(err);
    }
  }

  static async getSettings(req: any, res: any, next: any) {
    try {
      const data = await SlaService.Instance.getSettings(req.user);
      res.status(200).json(ApiResponse.ok("SLA settings", data));
    } catch (err) {
      next(err);
    }
  }

  static async updateSettings(req: any, res: any, next: any) {
    try {
      const data = await SlaService.Instance.updateSettings(req.user, req.validated.body);
      res.status(200).json(ApiResponse.ok("SLA settings updated", data));
    } catch (err) {
      next(err);
    }
  }
}
