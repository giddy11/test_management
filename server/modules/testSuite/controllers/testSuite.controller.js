// modules/testSuite/controllers/testSuite.controller.js
const { TestSuiteService } = require("../services/testSuite.service");
const { ApiResponse } = require("../../../shared/response/apiResponse");
const { toTestSuiteResponse } = require("../dto/testSuite.dto");

class TestSuiteController {
  static async fetchAll(req, res, next) {
    try {
      const result = await TestSuiteService.Instance.fetchTestSuites(
        req.user.id,
        req.validated.query
      );
      res
        .status(200)
        .json(
          ApiResponse.ok(
            "Test suites fetched",
            result.data.map(toTestSuiteResponse),
            result.meta
          )
        );
    } catch (err) {
      next(err);
    }
  }

  static async fetchById(req, res, next) {
    try {
      const suite = await TestSuiteService.Instance.getTestSuite(
        req.user.id,
        req.validated.params.id
      );
      res
        .status(200)
        .json(ApiResponse.ok("Test suite fetched", toTestSuiteResponse(suite)));
    } catch (err) {
      next(err);
    }
  }

  static async create(req, res, next) {
    try {
      const suite = await TestSuiteService.Instance.createTestSuite(
        req.user.id,
        req.validated.body
      );
      res
        .status(201)
        .json(ApiResponse.created("Test suite created", toTestSuiteResponse(suite)));
    } catch (err) {
      next(err);
    }
  }

  static async update(req, res, next) {
    try {
      const suite = await TestSuiteService.Instance.updateTestSuite(
        req.user.id,
        req.validated.params.id,
        req.validated.body
      );
      res
        .status(200)
        .json(ApiResponse.ok("Test suite updated", toTestSuiteResponse(suite)));
    } catch (err) {
      next(err);
    }
  }

  static async remove(req, res, next) {
    try {
      await TestSuiteService.Instance.deleteTestSuite(
        req.user.id,
        req.validated.params.id
      );
      res.status(200).json(ApiResponse.ok("Test suite deleted", null));
    } catch (err) {
      next(err);
    }
  }
}

module.exports = { TestSuiteController };
