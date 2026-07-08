// modules/testRun/routes/testRun.routes.js
const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { authorise } = require("../../../shared/middleware/authorise.middleware");
const {
  createTestRunSchema,
  updateTestRunSchema,
  idParamSchema,
  fetchTestRunsSchema,
  fetchActiveStatusSchema,
} = require("../validators/testRun.schema");
const { TestRunController } = require("../controllers/testRun.controller");

router.get("/", authMiddleware, validate(fetchTestRunsSchema), TestRunController.fetchAll);
router.get(
  "/active-status",
  authMiddleware,
  validate(fetchActiveStatusSchema),
  TestRunController.fetchActiveStatus
);
router.get("/:id", authMiddleware, validate(idParamSchema), TestRunController.fetchById);
router.post(
  "/",
  authMiddleware,
  authorise("superadmin", "admin", "user"),
  validate(createTestRunSchema),
  TestRunController.create
);
router.patch(
  "/:id",
  authMiddleware,
  authorise("superadmin", "admin", "user"),
  validate(updateTestRunSchema),
  TestRunController.update
);
router.delete(
  "/:id",
  authMiddleware,
  authorise("superadmin", "admin", "user"),
  validate(idParamSchema),
  TestRunController.remove
);

module.exports = router;
