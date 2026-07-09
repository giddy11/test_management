// modules/organization/controllers/organization.controller.ts
import { OrganizationService } from "../services/organization.service";

const { ApiResponse } = require("../../../shared/response/apiResponse");

export class OrganizationController {
  static async fetchAll(req: any, res: any, next: any) {
    try {
      const result = await OrganizationService.Instance.fetchOrganizations(req.validated.query);
      res.status(200).json(ApiResponse.ok("Organizations fetched", result.data, result.meta));
    } catch (err) {
      next(err);
    }
  }
}
