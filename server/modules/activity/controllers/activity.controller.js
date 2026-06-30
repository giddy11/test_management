// modules/activity/controllers/activity.controller.js
const { ActivityService } = require("../services/activity.service");
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
}

module.exports = { ActivityController };
