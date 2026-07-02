// modules/bug/controllers/bugAttachment.controller.js
const { BugAttachmentService } = require("../services/bugAttachment.service");
const { ApiResponse } = require("../../../shared/response/apiResponse");
const { toBugAttachmentResponse } = require("../dto/bugAttachment.dto");

class BugAttachmentController {
  static async list(req, res, next) {
    try {
      const items = await BugAttachmentService.Instance.listAttachments(
        req.user,
        req.validated.params.id
      );
      res.status(200).json(ApiResponse.ok("Attachments fetched", items.map(toBugAttachmentResponse)));
    } catch (err) {
      next(err);
    }
  }

  static async upload(req, res, next) {
    try {
      // req.files is guaranteed by uploadMany — raw buffers, never disk paths.
      const created = await BugAttachmentService.Instance.uploadAttachments(
        req.user,
        req.validated.params.id,
        req.files
      );
      res
        .status(201)
        .json(ApiResponse.created("Attachments uploaded", created.map(toBugAttachmentResponse)));
    } catch (err) {
      next(err);
    }
  }

  static async remove(req, res, next) {
    try {
      await BugAttachmentService.Instance.deleteAttachment(
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

module.exports = { BugAttachmentController };
