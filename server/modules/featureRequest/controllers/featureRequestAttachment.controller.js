// modules/featureRequest/controllers/featureRequestAttachment.controller.js
const {
  FeatureRequestAttachmentService,
} = require("../services/featureRequestAttachment.service");
const { ApiResponse } = require("../../../shared/response/apiResponse");
const {
  toFeatureRequestAttachmentResponse,
} = require("../dto/featureRequestAttachment.dto");

class FeatureRequestAttachmentController {
  static async list(req, res, next) {
    try {
      const items = await FeatureRequestAttachmentService.Instance.listAttachments(
        req.user,
        req.validated.params.id
      );
      res
        .status(200)
        .json(ApiResponse.ok("Attachments fetched", items.map(toFeatureRequestAttachmentResponse)));
    } catch (err) {
      next(err);
    }
  }

  static async upload(req, res, next) {
    try {
      // req.files is guaranteed by uploadMany — raw buffers, never disk paths.
      const created = await FeatureRequestAttachmentService.Instance.uploadAttachments(
        req.user,
        req.validated.params.id,
        req.files
      );
      res
        .status(201)
        .json(ApiResponse.created("Attachments uploaded", created.map(toFeatureRequestAttachmentResponse)));
    } catch (err) {
      next(err);
    }
  }

  static async remove(req, res, next) {
    try {
      await FeatureRequestAttachmentService.Instance.deleteAttachment(
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

module.exports = { FeatureRequestAttachmentController };
