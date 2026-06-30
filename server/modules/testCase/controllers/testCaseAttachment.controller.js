// modules/testCase/controllers/testCaseAttachment.controller.js
const {
  TestCaseAttachmentService,
} = require("../services/testCaseAttachment.service");
const { ApiResponse } = require("../../../shared/response/apiResponse");
const { toAttachmentResponse } = require("../dto/testCaseAttachment.dto");

class TestCaseAttachmentController {
  static async listForResult(req, res, next) {
    try {
      const items = await TestCaseAttachmentService.Instance.listRunResultAttachments(
        req.user,
        req.validated.params.id
      );
      res.status(200).json(ApiResponse.ok("Attachments fetched", items.map(toAttachmentResponse)));
    } catch (err) {
      next(err);
    }
  }

  static async uploadForResult(req, res, next) {
    try {
      const created = await TestCaseAttachmentService.Instance.uploadRunResultAttachments(
        req.user,
        req.validated.params.id,
        req.files
      );
      res.status(201).json(ApiResponse.created("Attachments uploaded", created.map(toAttachmentResponse)));
    } catch (err) {
      next(err);
    }
  }

  static async removeFromResult(req, res, next) {
    try {
      await TestCaseAttachmentService.Instance.deleteRunResultAttachment(
        req.user,
        req.params.id,
        req.params.attachmentId
      );
      res.status(200).json(ApiResponse.ok("Attachment deleted", null));
    } catch (err) {
      next(err);
    }
  }

  static async list(req, res, next) {
    try {
      const items = await TestCaseAttachmentService.Instance.listAttachments(
        req.user,
        req.validated.params.id
      );
      res
        .status(200)
        .json(ApiResponse.ok("Attachments fetched", items.map(toAttachmentResponse)));
    } catch (err) {
      next(err);
    }
  }

  static async upload(req, res, next) {
    try {
      // req.files is guaranteed by uploadMany — raw buffers, never disk paths.
      const created = await TestCaseAttachmentService.Instance.uploadAttachments(
        req.user,
        req.validated.params.id,
        req.files
      );
      res
        .status(201)
        .json(ApiResponse.created("Attachments uploaded", created.map(toAttachmentResponse)));
    } catch (err) {
      next(err);
    }
  }

  static async remove(req, res, next) {
    try {
      await TestCaseAttachmentService.Instance.deleteAttachment(
        req.user,
        req.validated.params.id,
        req.validated.params.attachmentId
      );
      res.status(200).json(ApiResponse.ok("Attachment deleted", null));
    } catch (err) {
      next(err);
    }
  }
}

module.exports = { TestCaseAttachmentController };
