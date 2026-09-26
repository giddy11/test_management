// modules/project/routes/project.routes.js
const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { requirePermission, requireProjectAccess } = require("../../../shared/access/can");
const {
  createProjectSchema,
  updateProjectSchema,
  idParamSchema,
  fetchProjectsSchema,
} = require("../validators/project.schema");
const { ProjectController } = require("../controllers/project.controller");

router.get("/", authMiddleware, requirePermission("project.read"), validate(fetchProjectsSchema), ProjectController.fetchAll);
router.get("/:id", authMiddleware, requirePermission("project.read"), validate(idParamSchema), ProjectController.fetchById);
router.get("/:id/export", authMiddleware, requirePermission("project.export"), validate(idParamSchema), ProjectController.exportProject);
router.post(
  "/",
  authMiddleware,
  requirePermission("project.manageall"),
  validate(createProjectSchema),
  ProjectController.create
);
router.patch(
  "/:id",
  authMiddleware,
  requireProjectAccess("Project management — decided by role in the project"),
  validate(updateProjectSchema),
  ProjectController.update
);
router.delete(
  "/:id",
  authMiddleware,
  requireProjectAccess("Project management — decided by role in the project"),
  validate(idParamSchema),
  ProjectController.remove
);

module.exports = router;
