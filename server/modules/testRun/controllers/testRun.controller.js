// modules/testRun/controllers/testRun.controller.js
const { TestRunService } = require("../services/testRun.service");
const { ApiResponse } = require("../../../shared/response/apiResponse");
const { toTestRunResponse } = require("../dto/testRun.dto");

class TestRunController {
  static async fetchAll(req, res, next) {
    try {
      const result = await TestRunService.Instance.fetchTestRuns(
        req.user,
        req.validated.query
      );
      res
        .status(200)
        .json(
          ApiResponse.ok(
            "Test runs fetched",
            result.data.map((r) => toTestRunResponse(r)),
            result.meta
          )
        );
    } catch (err) {
      next(err);
    }
  }

  static async fetchById(req, res, next) {
    try {
      const { run, summary } = await TestRunService.Instance.getTestRun(
        req.user,
        req.validated.params.id
      );
      res
        .status(200)
        .json(ApiResponse.ok("Test run fetched", toTestRunResponse(run, summary)));
    } catch (err) {
      next(err);
    }
  }

  static async create(req, res, next) {
    try {
      const { run, summary } = await TestRunService.Instance.createTestRun(
        req.user,
        req.validated.body
      );
      res
        .status(201)
        .json(ApiResponse.created("Test run created", toTestRunResponse(run, summary)));
    } catch (err) {
      next(err);
    }
  }

  static async update(req, res, next) {
    try {
      const { run, summary } = await TestRunService.Instance.updateTestRun(
        req.user,
        req.validated.params.id,
        req.validated.body
      );
      res
        .status(200)
        .json(ApiResponse.ok("Test run updated", toTestRunResponse(run, summary)));
    } catch (err) {
      next(err);
    }
  }

  static async remove(req, res, next) {
    try {
      await TestRunService.Instance.deleteTestRun(
        req.user,
        req.validated.params.id
      );
      res.status(200).json(ApiResponse.ok("Test run deleted", null));
    } catch (err) {
      next(err);
    }
  }
}

module.exports = { TestRunController };
