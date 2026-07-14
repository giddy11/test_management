// modules/testSuite/routes/testSuite.routes.js
const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { authorise } = require("../../../shared/middleware/authorise.middleware");
const {
  createTestSuiteSchema,
  updateTestSuiteSchema,
  idParamSchema,
  fetchTestSuitesSchema,
} = require("../validators/testSuite.schema");
const { TestSuiteController } = require("../controllers/testSuite.controller");

router.get("/", authMiddleware, authorise("superadmin", "admin", "user"), validate(fetchTestSuitesSchema), TestSuiteController.fetchAll);
router.get("/:id", authMiddleware, authorise("superadmin", "admin", "user"), validate(idParamSchema), TestSuiteController.fetchById);
router.get("/:id/export", authMiddleware, authorise("superadmin", "admin", "user"), validate(idParamSchema), TestSuiteController.exportSuite);
router.post(
  "/",
  authMiddleware,
  authorise("superadmin", "admin", "user"),
  validate(createTestSuiteSchema),
  TestSuiteController.create
);
router.patch(
  "/:id",
  authMiddleware,
  authorise("superadmin", "admin", "user"),
  validate(updateTestSuiteSchema),
  TestSuiteController.update
);
router.delete(
  "/:id",
  authMiddleware,
  authorise("superadmin", "admin", "user"),
  validate(idParamSchema),
  TestSuiteController.remove
);

module.exports = router;
