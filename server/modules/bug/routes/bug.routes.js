// modules/bug/routes/bug.routes.js
const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { requireProjectAccess } = require("../../../shared/access/can");
const {
  createBugSchema,
  manageBugSchema,
  idParamSchema,
  codeParamSchema,
  fetchBugsSchema,
} = require("../validators/bug.schema");
const { BugController } = require("../controllers/bug.controller");

router.get("/", authMiddleware, requireProjectAccess("Defects and feature requests — decided by role in the project"), validate(fetchBugsSchema), BugController.fetchAll);
router.get(
  "/by-code/:code",
  authMiddleware,
  requireProjectAccess("Defects and feature requests — decided by role in the project"),
  validate(codeParamSchema),
  BugController.fetchByCode
);
router.get("/:id", authMiddleware, requireProjectAccess("Defects and feature requests — decided by role in the project"), validate(idParamSchema), BugController.fetchById);
router.post("/", authMiddleware, requireProjectAccess("Defects and feature requests — decided by role in the project"), validate(createBugSchema), BugController.create);
router.patch(
  "/:id",
  authMiddleware,
  requireProjectAccess("Defects and feature requests — decided by role in the project"),
  validate(manageBugSchema),
  BugController.manage
);
router.delete(
  "/:id",
  authMiddleware,
  requireProjectAccess("Defects and feature requests — decided by role in the project"),
  validate(idParamSchema),
  BugController.remove
);

module.exports = router;
