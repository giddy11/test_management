// modules/testCase/routes/testCase.routes.js
const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { requirePermission } = require("../../../shared/access/can");
const {
  createTestCaseSchema,
  updateTestCaseSchema,
  assignTestCaseSchema,
  bulkAssignTestCaseSchema,
  idParamSchema,
  fetchTestCasesSchema,
} = require("../validators/testCase.schema");
const { TestCaseController } = require("../controllers/testCase.controller");

router.get("/", authMiddleware, requirePermission("testcase.read"), validate(fetchTestCasesSchema), TestCaseController.fetchAll);
router.get("/:id", authMiddleware, requirePermission("testcase.read"), validate(idParamSchema), TestCaseController.fetchById);
router.post(
  "/",
  authMiddleware,
  requirePermission("testcase.create"),
  validate(createTestCaseSchema),
  TestCaseController.create
);
router.patch(
  "/:id",
  authMiddleware,
  requirePermission("testcase.update"),
  validate(updateTestCaseSchema),
  TestCaseController.update
);
router.delete(
  "/:id",
  authMiddleware,
  requirePermission("testcase.delete"),
  validate(idParamSchema),
  TestCaseController.remove
);

// Add users to many test cases at once (existing assignees kept); logged as one activity entry.
router.patch(
  "/assignees/bulk",
  authMiddleware,
  requirePermission("testcase.assign"),
  validate(bulkAssignTestCaseSchema),
  TestCaseController.bulkAssign
);

// Assign (replace) the set of users on a test case.
router.patch(
  "/:id/assignees",
  authMiddleware,
  requirePermission("testcase.assign"),
  validate(assignTestCaseSchema),
  TestCaseController.assign
);

module.exports = router;
