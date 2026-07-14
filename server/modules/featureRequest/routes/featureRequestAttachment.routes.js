// modules/featureRequest/routes/featureRequestAttachment.routes.js
const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { authorise } = require("../../../shared/middleware/authorise.middleware");
const { uploadMany } = require("../../../shared/middleware/upload.middleware");
const {
  featureRequestIdParamSchema,
  attachmentParamsSchema,
} = require("../validators/featureRequestAttachment.schema");
const {
  FeatureRequestAttachmentController,
} = require("../controllers/featureRequestAttachment.controller");

// GET    /feature-requests/:id/attachments
router.get(
  "/:id/attachments",
  authMiddleware,
  authorise("superadmin", "admin", "user"),
  validate(featureRequestIdParamSchema),
  FeatureRequestAttachmentController.list
);

// POST   /feature-requests/:id/attachments  (multipart/form-data, field "images", up to 10)
router.post(
  "/:id/attachments",
  authMiddleware,
  authorise("superadmin", "admin", "user"),
  uploadMany("images", 10), // ① parse + validate files
  validate(featureRequestIdParamSchema), // ② validate params
  FeatureRequestAttachmentController.upload
);

// DELETE /feature-requests/:id/attachments/:attachmentId
router.delete(
  "/:id/attachments/:attachmentId",
  authMiddleware,
  authorise("superadmin", "admin", "user"),
  validate(attachmentParamsSchema),
  FeatureRequestAttachmentController.remove
);

module.exports = router;
