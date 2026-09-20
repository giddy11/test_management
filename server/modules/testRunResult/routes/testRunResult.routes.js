// modules/testRunResult/routes/testRunResult.routes.js
const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { requirePermission } = require("../../../shared/access/can");
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

router.get("/", authMiddleware, requirePermission("result.read"), validate(fetchResultsSchema), TestRunResultController.fetchAll);
// /bulk must be registered before /:id so Express doesn't treat "bulk" as a UUID param.
router.patch(
  "/bulk",
  authMiddleware,
  requirePermission("result.enter"),
  validate(bulkUpdateSchema),
  TestRunResultController.bulkUpdate
);
router.get("/:id", authMiddleware, requirePermission("result.read"), validate(idParamSchema), TestRunResultController.fetchById);
router.post(
  "/",
  authMiddleware,
  requirePermission("result.enter"),
  validate(createResultSchema),
  TestRunResultController.create
);
router.patch(
  "/:id",
  authMiddleware,
  requirePermission("result.enter"),
  validate(updateResultSchema),
  TestRunResultController.update
);
router.delete(
  "/:id",
  authMiddleware,
  requirePermission("result.delete"),
  validate(idParamSchema),
  TestRunResultController.remove
);

// Attachments scoped to a specific run result
router.get("/:id/attachments", authMiddleware, requirePermission("result.read"), validate(idParamSchema), TestCaseAttachmentController.listForResult);
router.post(
  "/:id/attachments",
  authMiddleware,
  requirePermission("result.enter"),
  uploadMany("images", 10),
  validate(idParamSchema),
  TestCaseAttachmentController.uploadForResult
);
router.delete(
  "/:id/attachments/:attachmentId",
  authMiddleware,
  requirePermission("result.enter"),
  validate(attachmentParamsSchema),
  TestCaseAttachmentController.removeFromResult
);

module.exports = router;
