// modules/testCase/controllers/testCase.controller.js
const { TestCaseService } = require("../services/testCase.service");
const { ApiResponse } = require("../../../shared/response/apiResponse");
const { toTestCaseResponse } = require("../dto/testCase.dto");

class TestCaseController {
  static async fetchAll(req, res, next) {
    try {
      const result = await TestCaseService.Instance.fetchTestCases(
        req.user,
        req.validated.query
      );
      res
        .status(200)
        .json(
          ApiResponse.ok(
            "Test cases fetched",
            result.data.map(toTestCaseResponse),
            result.meta
          )
        );
    } catch (err) {
      next(err);
    }
  }

  static async fetchById(req, res, next) {
    try {
      const tc = await TestCaseService.Instance.getTestCase(
        req.user,
        req.validated.params.id
      );
      res.status(200).json(ApiResponse.ok("Test case fetched", toTestCaseResponse(tc)));
    } catch (err) {
      next(err);
    }
  }

  static async create(req, res, next) {
    try {
      const tc = await TestCaseService.Instance.createTestCase(
        req.user,
        req.validated.body
      );
      res.status(201).json(ApiResponse.created("Test case created", toTestCaseResponse(tc)));
    } catch (err) {
      next(err);
    }
  }

  static async update(req, res, next) {
    try {
      const tc = await TestCaseService.Instance.updateTestCase(
        req.user,
        req.validated.params.id,
        req.validated.body
      );
      res.status(200).json(ApiResponse.ok("Test case updated", toTestCaseResponse(tc)));
    } catch (err) {
      next(err);
    }
  }

  static async remove(req, res, next) {
    try {
      await TestCaseService.Instance.deleteTestCase(
        req.user,
        req.validated.params.id
      );
      res.status(200).json(ApiResponse.ok("Test case deleted", null));
    } catch (err) {
      next(err);
    }
  }

  static async assign(req, res, next) {
    try {
      const { testCase } = await TestCaseService.Instance.assignUsers(
        req.user,
        req.validated.params.id,
        req.validated.body
      );
      res.status(200).json(ApiResponse.ok("Assignees updated", toTestCaseResponse(testCase)));
    } catch (err) {
      next(err);
    }
  }
}

module.exports = { TestCaseController };
