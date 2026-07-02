// modules/bug/routes/bug.routes.js
const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { authorise } = require("../../../shared/middleware/authorise.middleware");
const {
  createBugSchema,
  manageBugSchema,
  idParamSchema,
  fetchBugsSchema,
} = require("../validators/bug.schema");
const { BugController } = require("../controllers/bug.controller");

router.get("/", authMiddleware, validate(fetchBugsSchema), BugController.fetchAll);
router.get("/:id", authMiddleware, validate(idParamSchema), BugController.fetchById);
router.post("/", authMiddleware, validate(createBugSchema), BugController.create);
router.patch(
  "/:id",
  authMiddleware,
  authorise("superadmin", "admin"),
  validate(manageBugSchema),
  BugController.manage
);
router.delete(
  "/:id",
  authMiddleware,
  authorise("superadmin", "admin"),
  validate(idParamSchema),
  BugController.remove
);

module.exports = router;
