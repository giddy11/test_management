// modules/testCase/routes/testCaseAttachment.routes.js
const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { requirePermission } = require("../../../shared/access/can");
const { uploadMany } = require("../../../shared/middleware/upload.middleware");
const {
  testCaseIdParamSchema,
  attachmentParamsSchema,
} = require("../validators/testCaseAttachment.schema");
const {
  TestCaseAttachmentController,
} = require("../controllers/testCaseAttachment.controller");

// GET    /test-cases/:id/attachments
router.get(
  "/:id/attachments",
  authMiddleware,
  requirePermission("testcase.read"),
  validate(testCaseIdParamSchema),
  TestCaseAttachmentController.list
);

// POST   /test-cases/:id/attachments  (multipart/form-data, field "images", up to 10)
router.post(
  "/:id/attachments",
  authMiddleware,
  requirePermission("testcase.update"),
  uploadMany("images", 10), // ① parse + validate files
  validate(testCaseIdParamSchema), // ② validate params
  TestCaseAttachmentController.upload
);

// DELETE /test-cases/:id/attachments/:attachmentId
router.delete(
  "/:id/attachments/:attachmentId",
  authMiddleware,
  requirePermission("testcase.update"),
  validate(attachmentParamsSchema),
  TestCaseAttachmentController.remove
);

module.exports = router;
