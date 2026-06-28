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

router.get("/", authMiddleware, validate(fetchTestSuitesSchema), TestSuiteController.fetchAll);
router.get("/:id", authMiddleware, validate(idParamSchema), TestSuiteController.fetchById);
router.post(
  "/",
  authMiddleware,
  authorise("admin", "lead"),
  validate(createTestSuiteSchema),
  TestSuiteController.create
);
router.patch(
  "/:id",
  authMiddleware,
  authorise("admin", "lead"),
  validate(updateTestSuiteSchema),
  TestSuiteController.update
);
router.delete(
  "/:id",
  authMiddleware,
  authorise("admin", "lead"),
  validate(idParamSchema),
  TestSuiteController.remove
);

module.exports = router;
