// modules/featureRequest/routes/featureRequestAttachment.routes.js
const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { requireProjectAccess } = require("../../../shared/access/can");
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
  requireProjectAccess("Defects and feature requests — decided by role in the project"),
  validate(featureRequestIdParamSchema),
  FeatureRequestAttachmentController.list
);

// POST   /feature-requests/:id/attachments  (multipart/form-data, field "images", up to 10)
router.post(
  "/:id/attachments",
  authMiddleware,
  requireProjectAccess("Defects and feature requests — decided by role in the project"),
  uploadMany("images", 10), // ① parse + validate files
  validate(featureRequestIdParamSchema), // ② validate params
  FeatureRequestAttachmentController.upload
);

// DELETE /feature-requests/:id/attachments/:attachmentId
router.delete(
  "/:id/attachments/:attachmentId",
  authMiddleware,
  requireProjectAccess("Defects and feature requests — decided by role in the project"),
  validate(attachmentParamsSchema),
  FeatureRequestAttachmentController.remove
);

module.exports = router;
