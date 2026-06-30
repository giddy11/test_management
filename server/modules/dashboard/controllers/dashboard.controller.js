// modules/dashboard/controllers/dashboard.controller.js
const { DashboardService } = require("../services/dashboard.service");
const { ApiResponse } = require("../../../shared/response/apiResponse");

class DashboardController {
  static async overview(req, res, next) {
    try {
      const data = await DashboardService.Instance.overview(
        req.user.id,
        req.validated.query.projectId
      );
      res.status(200).json(ApiResponse.ok("Dashboard overview", data));
    } catch (err) {
      next(err);
    }
  }
}

module.exports = { DashboardController };
