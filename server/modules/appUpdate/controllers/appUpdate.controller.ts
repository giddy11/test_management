// modules/appUpdate/controllers/appUpdate.controller.ts
import { AppUpdateService } from "../services/appUpdate.service";

const { ApiResponse } = require("../../../shared/response/apiResponse");

export class AppUpdateController {
  static async create(req: any, res: any, next: any) {
    try {
      const update = await AppUpdateService.Instance.createUpdate(req.validated.body);
      res.status(201).json(ApiResponse.created("Update published", update));
    } catch (err) {
      next(err);
    }
  }

  static async createBulk(req: any, res: any, next: any) {
    try {
      const updates = await AppUpdateService.Instance.createBulkUpdates(req.validated.body.items);
      res.status(201).json(ApiResponse.created("Updates published", updates));
    } catch (err) {
      next(err);
    }
  }

  static async fetchAll(req: any, res: any, next: any) {
    try {
      const updates = await AppUpdateService.Instance.fetchAll();
      res.status(200).json(ApiResponse.ok("Updates fetched", updates));
    } catch (err) {
      next(err);
    }
  }

  static async fetchUnseen(req: any, res: any, next: any) {
    try {
      const updates = await AppUpdateService.Instance.fetchUnseen(req.user);
      res.status(200).json(ApiResponse.ok("Unseen updates fetched", updates));
    } catch (err) {
      next(err);
    }
  }

  static async markSeen(req: any, res: any, next: any) {
    try {
      await AppUpdateService.Instance.markSeen(req.user);
      res.status(200).json(ApiResponse.ok("Updates marked seen", null));
    } catch (err) {
      next(err);
    }
  }

  static async deleteBulk(req: any, res: any, next: any) {
    try {
      await AppUpdateService.Instance.deleteUpdates(req.validated.body.ids);
      res.status(200).json(ApiResponse.ok("Updates deleted", null));
    } catch (err) {
      next(err);
    }
  }
}
