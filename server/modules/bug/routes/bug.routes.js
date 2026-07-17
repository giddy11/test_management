// modules/bug/routes/bug.routes.js
const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { authorise } = require("../../../shared/middleware/authorise.middleware");
const {
  createBugSchema,
  manageBugSchema,
  idParamSchema,
  codeParamSchema,
  fetchBugsSchema,
} = require("../validators/bug.schema");
const { BugController } = require("../controllers/bug.controller");

router.get("/", authMiddleware, authorise("superadmin", "admin", "user"), validate(fetchBugsSchema), BugController.fetchAll);
router.get(
  "/by-code/:code",
  authMiddleware,
  authorise("superadmin", "admin", "user"),
  validate(codeParamSchema),
  BugController.fetchByCode
);
router.get("/:id", authMiddleware, authorise("superadmin", "admin", "user"), validate(idParamSchema), BugController.fetchById);
router.post("/", authMiddleware, authorise("superadmin", "admin", "user"), validate(createBugSchema), BugController.create);
router.patch(
  "/:id",
  authMiddleware,
  authorise("superadmin", "admin", "user"),
  validate(manageBugSchema),
  BugController.manage
);
router.delete(
  "/:id",
  authMiddleware,
  authorise("superadmin", "admin", "user"),
  validate(idParamSchema),
  BugController.remove
);

module.exports = router;
