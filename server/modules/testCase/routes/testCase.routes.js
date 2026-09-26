// modules/testCase/routes/testCase.routes.js
const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { requireProjectAccess } = require("../../../shared/access/can");
const {
  createTestCaseSchema,
  updateTestCaseSchema,
  assignTestCaseSchema,
  bulkAssignTestCaseSchema,
  idParamSchema,
  fetchTestCasesSchema,
} = require("../validators/testCase.schema");
const { TestCaseController } = require("../controllers/testCase.controller");

router.get("/", authMiddleware, requireProjectAccess("Test authoring — decided by role in the project"), validate(fetchTestCasesSchema), TestCaseController.fetchAll);
router.get("/:id", authMiddleware, requireProjectAccess("Test authoring — decided by role in the project"), validate(idParamSchema), TestCaseController.fetchById);
router.post(
  "/",
  authMiddleware,
  requireProjectAccess("Test authoring — decided by role in the project"),
  validate(createTestCaseSchema),
  TestCaseController.create
);
router.patch(
  "/:id",
  authMiddleware,
  requireProjectAccess("Test authoring — decided by role in the project"),
  validate(updateTestCaseSchema),
  TestCaseController.update
);
router.delete(
  "/:id",
  authMiddleware,
  requireProjectAccess("Test authoring — decided by role in the project"),
  validate(idParamSchema),
  TestCaseController.remove
);

// Add users to many test cases at once (existing assignees kept); logged as one activity entry.
router.patch(
  "/assignees/bulk",
  authMiddleware,
  requireProjectAccess("Test authoring — decided by role in the project"),
  validate(bulkAssignTestCaseSchema),
  TestCaseController.bulkAssign
);

// Assign (replace) the set of users on a test case.
router.patch(
  "/:id/assignees",
  authMiddleware,
  requireProjectAccess("Test authoring — decided by role in the project"),
  validate(assignTestCaseSchema),
  TestCaseController.assign
);

module.exports = router;
