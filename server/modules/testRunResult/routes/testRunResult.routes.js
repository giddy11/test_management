// modules/testRunResult/routes/testRunResult.routes.js
const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { authorise } = require("../../../shared/middleware/authorise.middleware");
const {
  createResultSchema,
  updateResultSchema,
  idParamSchema,
  fetchResultsSchema,
} = require("../validators/testRunResult.schema");
const { TestRunResultController } = require("../controllers/testRunResult.controller");

router.get("/", authMiddleware, validate(fetchResultsSchema), TestRunResultController.fetchAll);
router.get("/:id", authMiddleware, validate(idParamSchema), TestRunResultController.fetchById);
router.post(
  "/",
  authMiddleware,
  authorise("admin", "lead", "tester"),
  validate(createResultSchema),
  TestRunResultController.create
);
router.patch(
  "/:id",
  authMiddleware,
  authorise("admin", "lead", "tester"),
  validate(updateResultSchema),
  TestRunResultController.update
);
router.delete(
  "/:id",
  authMiddleware,
  authorise("admin", "lead"),
  validate(idParamSchema),
  TestRunResultController.remove
);

module.exports = router;
