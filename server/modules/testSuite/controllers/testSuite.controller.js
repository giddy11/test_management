// modules/testSuite/controllers/testSuite.controller.js
const { TestSuiteService } = require("../services/testSuite.service");
const { TestCaseExportService } = require("../../testCase/services/testCaseExport.service");
const { ApiResponse } = require("../../../shared/response/apiResponse");
const { toTestSuiteResponse } = require("../dto/testSuite.dto");

class TestSuiteController {
  static async fetchAll(req, res, next) {
    try {
      const result = await TestSuiteService.Instance.fetchTestSuites(
        req.user,
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
        req.user,
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
        req.user,
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
        req.user,
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

  // GET /test-suites/:id/export — streams the suite's test cases as a single-sheet .xlsx.
  static async exportSuite(req, res, next) {
    try {
      const { buffer, filename } = await TestCaseExportService.Instance.exportSuite(
        req.user,
        req.validated.params.id
      );
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
      res.status(200).send(Buffer.from(buffer));
    } catch (err) {
      next(err);
    }
  }

  static async remove(req, res, next) {
    try {
      await TestSuiteService.Instance.deleteTestSuite(
        req.user,
        req.validated.params.id
      );
      res.status(200).json(ApiResponse.ok("Test suite deleted", null));
    } catch (err) {
      next(err);
    }
  }
}

module.exports = { TestSuiteController };
