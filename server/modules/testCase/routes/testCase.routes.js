// modules/testCase/routes/testCase.routes.js
const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { authorise } = require("../../../shared/middleware/authorise.middleware");
const {
  createTestCaseSchema,
  updateTestCaseSchema,
  assignTestCaseSchema,
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

// Assign (replace) the set of users on a test case.
router.patch(
  "/:id/assignees",
  authMiddleware,
  authorise("superadmin", "admin"),
  validate(assignTestCaseSchema),
  TestCaseController.assign
);

module.exports = router;
