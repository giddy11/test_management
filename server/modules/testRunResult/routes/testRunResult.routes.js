// modules/testRunResult/routes/testRunResult.routes.js
const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { requireProjectAccess } = require("../../../shared/access/can");
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

router.get("/", authMiddleware, requireProjectAccess("Test execution — decided by role in the project"), validate(fetchResultsSchema), TestRunResultController.fetchAll);
// /bulk must be registered before /:id so Express doesn't treat "bulk" as a UUID param.
router.patch(
  "/bulk",
  authMiddleware,
  requireProjectAccess("Test execution — decided by role in the project"),
  validate(bulkUpdateSchema),
  TestRunResultController.bulkUpdate
);
router.get("/:id", authMiddleware, requireProjectAccess("Test execution — decided by role in the project"), validate(idParamSchema), TestRunResultController.fetchById);
router.post(
  "/",
  authMiddleware,
  requireProjectAccess("Test execution — decided by role in the project"),
  validate(createResultSchema),
  TestRunResultController.create
);
router.patch(
  "/:id",
  authMiddleware,
  requireProjectAccess("Test execution — decided by role in the project"),
  validate(updateResultSchema),
  TestRunResultController.update
);
router.delete(
  "/:id",
  authMiddleware,
  requireProjectAccess("Test execution — decided by role in the project"),
  validate(idParamSchema),
  TestRunResultController.remove
);

// Attachments scoped to a specific run result
router.get("/:id/attachments", authMiddleware, requireProjectAccess("Test execution — decided by role in the project"), validate(idParamSchema), TestCaseAttachmentController.listForResult);
router.post(
  "/:id/attachments",
  authMiddleware,
  requireProjectAccess("Test execution — decided by role in the project"),
  uploadMany("images", 10),
  validate(idParamSchema),
  TestCaseAttachmentController.uploadForResult
);
router.delete(
  "/:id/attachments/:attachmentId",
  authMiddleware,
  requireProjectAccess("Test execution — decided by role in the project"),
  validate(attachmentParamsSchema),
  TestCaseAttachmentController.removeFromResult
);

module.exports = router;
