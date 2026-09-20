// modules/bug/routes/bug.routes.js
const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { requirePermission } = require("../../../shared/access/can");
const {
  createBugSchema,
  manageBugSchema,
  idParamSchema,
  codeParamSchema,
  fetchBugsSchema,
} = require("../validators/bug.schema");
const { BugController } = require("../controllers/bug.controller");

router.get("/", authMiddleware, requirePermission("bug.read"), validate(fetchBugsSchema), BugController.fetchAll);
router.get(
  "/by-code/:code",
  authMiddleware,
  requirePermission("bug.read"),
  validate(codeParamSchema),
  BugController.fetchByCode
);
router.get("/:id", authMiddleware, requirePermission("bug.read"), validate(idParamSchema), BugController.fetchById);
router.post("/", authMiddleware, requirePermission("bug.create"), validate(createBugSchema), BugController.create);
router.patch(
  "/:id",
  authMiddleware,
  requirePermission("bug.update"),
  validate(manageBugSchema),
  BugController.manage
);
router.delete(
  "/:id",
  authMiddleware,
  requirePermission("bug.delete"),
  validate(idParamSchema),
  BugController.remove
);

module.exports = router;
