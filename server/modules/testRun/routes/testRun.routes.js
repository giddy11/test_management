// modules/testRun/routes/testRun.routes.js
const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { requireProjectAccess } = require("../../../shared/access/can");
const {
  createTestRunSchema,
  updateTestRunSchema,
  idParamSchema,
  fetchTestRunsSchema,
  fetchActiveStatusSchema,
} = require("../validators/testRun.schema");
const { TestRunController } = require("../controllers/testRun.controller");

router.get("/", authMiddleware, requireProjectAccess("Test execution — decided by role in the project"), validate(fetchTestRunsSchema), TestRunController.fetchAll);
router.get(
  "/active-status",
  authMiddleware,
  requireProjectAccess("Test execution — decided by role in the project"),
  validate(fetchActiveStatusSchema),
  TestRunController.fetchActiveStatus
);
router.get("/:id", authMiddleware, requireProjectAccess("Test execution — decided by role in the project"), validate(idParamSchema), TestRunController.fetchById);
router.post(
  "/",
  authMiddleware,
  requireProjectAccess("Test execution — decided by role in the project"),
  validate(createTestRunSchema),
  TestRunController.create
);
router.patch(
  "/:id",
  authMiddleware,
  requireProjectAccess("Test execution — decided by role in the project"),
  validate(updateTestRunSchema),
  TestRunController.update
);
router.delete(
  "/:id",
  authMiddleware,
  requireProjectAccess("Test execution — decided by role in the project"),
  validate(idParamSchema),
  TestRunController.remove
);

module.exports = router;
