// modules/bug/routes/bugAttachment.routes.js
const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { requireProjectAccess } = require("../../../shared/access/can");
const { uploadMany } = require("../../../shared/middleware/upload.middleware");
const {
  bugIdParamSchema,
  attachmentParamsSchema,
} = require("../validators/bugAttachment.schema");
const { BugAttachmentController } = require("../controllers/bugAttachment.controller");

// GET    /bugs/:id/attachments
router.get(
  "/:id/attachments",
  authMiddleware,
  requireProjectAccess("Defects and feature requests — decided by role in the project"),
  validate(bugIdParamSchema),
  BugAttachmentController.list
);

// POST   /bugs/:id/attachments  (multipart/form-data, field "images", up to 10)
router.post(
  "/:id/attachments",
  authMiddleware,
  requireProjectAccess("Defects and feature requests — decided by role in the project"),
  uploadMany("images", 10), // ① parse + validate files
  validate(bugIdParamSchema), // ② validate params
  BugAttachmentController.upload
);

// DELETE /bugs/:id/attachments/:attachmentId
router.delete(
  "/:id/attachments/:attachmentId",
  authMiddleware,
  requireProjectAccess("Defects and feature requests — decided by role in the project"),
  validate(attachmentParamsSchema),
  BugAttachmentController.remove
);

module.exports = router;
