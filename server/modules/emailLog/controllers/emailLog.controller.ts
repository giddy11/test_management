// modules/emailLog/controllers/emailLog.controller.ts
import { EmailLogService } from "../services/emailLog.service";
import { toEmailLogResponse } from "../dto/emailLog.dto";

const { ApiResponse } = require("../../../shared/response/apiResponse");

export class EmailLogController {
  // GET /email-logs
  static async list(req: any, res: any, next: any) {
    try {
      const { page, limit, ...filters } = req.validated.query;
      const result = await EmailLogService.Instance.list(filters, page, limit);
      res.status(200).json(ApiResponse.ok("Email log fetched", result.data.map(toEmailLogResponse), result.meta));
    } catch (err) {
      next(err);
    }
  }

  // GET /email-logs/summary
  static async summary(req: any, res: any, next: any) {
    try {
      const data = await EmailLogService.Instance.summary(req.validated.query);
      res.status(200).json(ApiResponse.ok("Email log summary fetched", data));
    } catch (err) {
      next(err);
    }
  }
}
