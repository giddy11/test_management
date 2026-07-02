// modules/bug/routes/bugAttachment.routes.js
const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { authorise } = require("../../../shared/middleware/authorise.middleware");
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
  validate(bugIdParamSchema),
  BugAttachmentController.list
);

// POST   /bugs/:id/attachments  (multipart/form-data, field "images", up to 10)
router.post(
  "/:id/attachments",
  authMiddleware,
  authorise("superadmin", "admin", "user"),
  uploadMany("images", 10), // ① parse + validate files
  validate(bugIdParamSchema), // ② validate params
  BugAttachmentController.upload
);

// DELETE /bugs/:id/attachments/:attachmentId
router.delete(
  "/:id/attachments/:attachmentId",
  authMiddleware,
  authorise("superadmin", "admin", "user"),
  validate(attachmentParamsSchema),
  BugAttachmentController.remove
);

module.exports = router;
