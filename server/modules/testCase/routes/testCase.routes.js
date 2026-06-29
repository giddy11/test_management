// modules/testCase/routes/testCase.routes.js
const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { authorise } = require("../../../shared/middleware/authorise.middleware");
const {
  createTestCaseSchema,
  updateTestCaseSchema,
  idParamSchema,
  fetchTestCasesSchema,
} = require("../validators/testCase.schema");
const { TestCaseController } = require("../controllers/testCase.controller");

router.get("/", authMiddleware, validate(fetchTestCasesSchema), TestCaseController.fetchAll);
router.get("/:id", authMiddleware, validate(idParamSchema), TestCaseController.fetchById);
router.post(
  "/",
  authMiddleware,
  authorise("superadmin", "admin"),
  validate(createTestCaseSchema),
  TestCaseController.create
);
router.patch(
  "/:id",
  authMiddleware,
  authorise("superadmin", "admin"),
  validate(updateTestCaseSchema),
  TestCaseController.update
);
router.delete(
  "/:id",
  authMiddleware,
  authorise("superadmin", "admin"),
  validate(idParamSchema),
  TestCaseController.remove
);

module.exports = router;
