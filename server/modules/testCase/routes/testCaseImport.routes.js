// modules/testCase/routes/testCaseImport.routes.js
const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { authorise } = require("../../../shared/middleware/authorise.middleware");
const { uploadSpreadsheet } = require("../../../shared/middleware/upload.middleware");
const {
  importUploadSchema,
  importIdParamSchema,
  importConfirmSchema,
} = require("../validators/testCaseImport.schema");
const { TestCaseImportController } = require("../controllers/testCaseImport.controller");

// 1) Download the pre-formatted template
router.get("/template", authMiddleware, TestCaseImportController.downloadTemplate);

// 2) Upload the filled sheet → parse + preview
router.post(
  "/import",
  authMiddleware,
  authorise("superadmin", "admin"),
  uploadSpreadsheet("file"), // parse multipart, validate MIME + size
  validate(importUploadSchema), // validate non-file fields (suiteId)
  TestCaseImportController.upload
);

// 3) Re-fetch the preview
router.get(
  "/import/:importId",
  authMiddleware,
  validate(importIdParamSchema),
  TestCaseImportController.preview
);

// 4) Confirm & save
router.post(
  "/import/:importId/confirm",
  authMiddleware,
  authorise("superadmin", "admin"),
  validate(importConfirmSchema),
  TestCaseImportController.confirm
);

module.exports = router;
