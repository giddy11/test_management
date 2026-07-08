// modules/testRunResult/routes/testRunResult.routes.js
const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { authorise } = require("../../../shared/middleware/authorise.middleware");
const { uploadMany } = require("../../../shared/middleware/upload.middleware");
const {
  createResultSchema,
  updateResultSchema,
  idParamSchema,
  fetchResultsSchema,
  bulkUpdateSchema,
} = require("../validators/testRunResult.schema");
const { TestRunResultController } = require("../controllers/testRunResult.controller");
const { TestCaseAttachmentController } = require("../../testCase/controllers/testCaseAttachment.controller");
const { attachmentParamsSchema } = require("../../testCase/validators/testCaseAttachment.schema");

router.get("/", authMiddleware, validate(fetchResultsSchema), TestRunResultController.fetchAll);
// /bulk must be registered before /:id so Express doesn't treat "bulk" as a UUID param.
router.patch(
  "/bulk",
  authMiddleware,
  authorise("superadmin", "admin", "user"),
  validate(bulkUpdateSchema),
  TestRunResultController.bulkUpdate
);
router.get("/:id", authMiddleware, validate(idParamSchema), TestRunResultController.fetchById);
router.post(
  "/",
  authMiddleware,
  authorise("superadmin", "admin", "user"),
  validate(createResultSchema),
  TestRunResultController.create
);
router.patch(
  "/:id",
  authMiddleware,
  authorise("superadmin", "admin", "user"),
  validate(updateResultSchema),
  TestRunResultController.update
);
router.delete(
  "/:id",
  authMiddleware,
  authorise("superadmin", "admin", "user"),
  validate(idParamSchema),
  TestRunResultController.remove
);

// Attachments scoped to a specific run result
router.get("/:id/attachments", authMiddleware, validate(idParamSchema), TestCaseAttachmentController.listForResult);
router.post(
  "/:id/attachments",
  authMiddleware,
  authorise("superadmin", "admin", "user"),
  uploadMany("images", 10),
  validate(idParamSchema),
  TestCaseAttachmentController.uploadForResult
);
router.delete(
  "/:id/attachments/:attachmentId",
  authMiddleware,
  authorise("superadmin", "admin", "user"),
  validate(attachmentParamsSchema),
  TestCaseAttachmentController.removeFromResult
);

module.exports = router;
