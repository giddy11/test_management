// modules/project/routes/project.routes.js
const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { authorise } = require("../../../shared/middleware/authorise.middleware");
const {
  createProjectSchema,
  updateProjectSchema,
  idParamSchema,
  fetchProjectsSchema,
} = require("../validators/project.schema");
const { ProjectController } = require("../controllers/project.controller");

router.get("/", authMiddleware, validate(fetchProjectsSchema), ProjectController.fetchAll);
router.get("/:id", authMiddleware, validate(idParamSchema), ProjectController.fetchById);
router.get("/:id/export", authMiddleware, validate(idParamSchema), ProjectController.exportProject);
router.post(
  "/",
  authMiddleware,
  authorise("superadmin", "admin"),
  validate(createProjectSchema),
  ProjectController.create
);
router.patch(
  "/:id",
  authMiddleware,
  authorise("superadmin", "admin"),
  validate(updateProjectSchema),
  ProjectController.update
);
router.delete(
  "/:id",
  authMiddleware,
  authorise("superadmin", "admin"),
  validate(idParamSchema),
  ProjectController.remove
);

module.exports = router;
