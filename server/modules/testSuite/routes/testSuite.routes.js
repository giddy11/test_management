// modules/testSuite/routes/testSuite.routes.js
const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { requirePermission, requireProjectAccess } = require("../../../shared/access/can");
const {
  createTestSuiteSchema,
  updateTestSuiteSchema,
  idParamSchema,
  fetchTestSuitesSchema,
} = require("../validators/testSuite.schema");
const { TestSuiteController } = require("../controllers/testSuite.controller");

router.get("/", authMiddleware, requireProjectAccess("Test authoring — decided by role in the project"), validate(fetchTestSuitesSchema), TestSuiteController.fetchAll);
router.get("/:id", authMiddleware, requireProjectAccess("Test authoring — decided by role in the project"), validate(idParamSchema), TestSuiteController.fetchById);
router.get("/:id/export", authMiddleware, requirePermission("project.export"), validate(idParamSchema), TestSuiteController.exportSuite);
router.post(
  "/",
  authMiddleware,
  requireProjectAccess("Test authoring — decided by role in the project"),
  validate(createTestSuiteSchema),
  TestSuiteController.create
);
router.patch(
  "/:id",
  authMiddleware,
  requireProjectAccess("Test authoring — decided by role in the project"),
  validate(updateTestSuiteSchema),
  TestSuiteController.update
);
router.delete(
  "/:id",
  authMiddleware,
  requireProjectAccess("Test authoring — decided by role in the project"),
  validate(idParamSchema),
  TestSuiteController.remove
);

module.exports = router;
