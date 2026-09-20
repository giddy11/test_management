// modules/testRun/routes/testRun.routes.js
const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { requirePermission } = require("../../../shared/access/can");
const {
  createTestRunSchema,
  updateTestRunSchema,
  idParamSchema,
  fetchTestRunsSchema,
  fetchActiveStatusSchema,
} = require("../validators/testRun.schema");
const { TestRunController } = require("../controllers/testRun.controller");

router.get("/", authMiddleware, requirePermission("run.read"), validate(fetchTestRunsSchema), TestRunController.fetchAll);
router.get(
  "/active-status",
  authMiddleware,
  requirePermission("run.read"),
  validate(fetchActiveStatusSchema),
  TestRunController.fetchActiveStatus
);
router.get("/:id", authMiddleware, requirePermission("run.read"), validate(idParamSchema), TestRunController.fetchById);
router.post(
  "/",
  authMiddleware,
  requirePermission("run.create"),
  validate(createTestRunSchema),
  TestRunController.create
);
router.patch(
  "/:id",
  authMiddleware,
  requirePermission("run.update"),
  validate(updateTestRunSchema),
  TestRunController.update
);
router.delete(
  "/:id",
  authMiddleware,
  requirePermission("run.delete"),
  validate(idParamSchema),
  TestRunController.remove
);

module.exports = router;
