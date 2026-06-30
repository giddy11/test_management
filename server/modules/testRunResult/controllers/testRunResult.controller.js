// modules/testRunResult/controllers/testRunResult.controller.js
const { TestRunResultService } = require("../services/testRunResult.service");
const { ApiResponse } = require("../../../shared/response/apiResponse");
const { toResultResponse } = require("../dto/testRunResult.dto");

class TestRunResultController {
  static async fetchAll(req, res, next) {
    try {
      const result = await TestRunResultService.Instance.fetchResults(
        req.user,
        req.validated.query
      );
      res
        .status(200)
        .json(
          ApiResponse.ok(
            "Run results fetched",
            result.data.map(toResultResponse),
            result.meta
          )
        );
    } catch (err) {
      next(err);
    }
  }

  static async fetchById(req, res, next) {
    try {
      const result = await TestRunResultService.Instance.getResult(
        req.user,
        req.validated.params.id
      );
      res.status(200).json(ApiResponse.ok("Run result fetched", toResultResponse(result)));
    } catch (err) {
      next(err);
    }
  }

  static async create(req, res, next) {
    try {
      const result = await TestRunResultService.Instance.createResult(
        req.user,
        req.validated.body
      );
      res
        .status(201)
        .json(ApiResponse.created("Run result added", toResultResponse(result)));
    } catch (err) {
      next(err);
    }
  }

  static async update(req, res, next) {
    try {
      const result = await TestRunResultService.Instance.recordResult(
        req.user,
        req.validated.params.id,
        req.validated.body
      );
      res.status(200).json(ApiResponse.ok("Run result recorded", toResultResponse(result)));
    } catch (err) {
      next(err);
    }
  }

  static async remove(req, res, next) {
    try {
      await TestRunResultService.Instance.deleteResult(
        req.user,
        req.validated.params.id
      );
      res.status(200).json(ApiResponse.ok("Run result deleted", null));
    } catch (err) {
      next(err);
    }
  }

  static async bulkUpdate(req, res, next) {
    try {
      await TestRunResultService.Instance.bulkRecordResults(
        req.user,
        req.validated.body
      );
      res.status(200).json(ApiResponse.ok("Results updated", null));
    } catch (err) {
      next(err);
    }
  }
}

module.exports = { TestRunResultController };
