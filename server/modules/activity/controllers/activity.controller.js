// modules/activity/controllers/activity.controller.js
const { ActivityService } = require("../services/activity.service");
const { ActivityExportService } = require("../services/activityExport.service");
const { ApiResponse } = require("../../../shared/response/apiResponse");
const { toActivityResponse } = require("../dto/activity.dto");

class ActivityController {
  static async fetchAll(req, res, next) {
    try {
      const result = await ActivityService.Instance.fetch(req.user, req.validated.query);
      res
        .status(200)
        .json(
          ApiResponse.ok(
            "Activity fetched",
            result.data.map(toActivityResponse),
            result.meta
          )
        );
    } catch (err) {
      next(err);
    }
  }

  // GET /activity/export — the current filtered view as a CSV download.
  static async exportAll(req, res, next) {
    try {
      const { csv, filename } = await ActivityExportService.Instance.exportCsv(
        req.user,
        req.validated.query
      );
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
      res.status(200).send(csv);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = { ActivityController };
