// modules/testCase/controllers/testCaseImport.controller.js
const { TestCaseImportService } = require("../services/testCaseImport.service");
const { TestCaseTemplateService } = require("../services/testCaseTemplate.service");
const { ApiResponse } = require("../../../shared/response/apiResponse");
const { AppError } = require("../../../shared/errors/AppError");

class TestCaseImportController {
  // GET /test-cases/template — streams the .xlsx template.
  static async downloadTemplate(req, res, next) {
    try {
      const buffer = await TestCaseTemplateService.Instance.buildTemplate();
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader("Content-Disposition", "attachment; filename=testmate-template.xlsx");
      res.status(200).send(Buffer.from(buffer));
    } catch (err) {
      next(err);
    }
  }

  // POST /test-cases/import — multipart file + suiteId.
  static async upload(req, res, next) {
    try {
      if (!req.file) throw new AppError("No spreadsheet uploaded", 400);
      const result = await TestCaseImportService.Instance.upload(
        req.user.id,
        req.validated.body.suiteId,
        req.file.buffer
      );
      res.status(200).json(ApiResponse.ok("File parsed — review before saving", result));
    } catch (err) {
      next(err);
    }
  }

  // GET /test-cases/import/:importId
  static async preview(req, res, next) {
    try {
      const result = TestCaseImportService.Instance.getPreview(
        req.user.id,
        req.validated.params.importId
      );
      res.status(200).json(ApiResponse.ok("Import preview", result));
    } catch (err) {
      next(err);
    }
  }

  // POST /test-cases/import/:importId/confirm
  static async confirm(req, res, next) {
    try {
      const result = await TestCaseImportService.Instance.confirm(
        req.user.id,
        req.validated.params.importId
      );
      res.status(201).json(ApiResponse.created("Test cases imported", result));
    } catch (err) {
      next(err);
    }
  }
}

module.exports = { TestCaseImportController };
