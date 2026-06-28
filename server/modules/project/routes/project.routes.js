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
router.post(
  "/",
  authMiddleware,
  authorise("admin", "lead"),
  validate(createProjectSchema),
  ProjectController.create
);
router.patch(
  "/:id",
  authMiddleware,
  authorise("admin", "lead"),
  validate(updateProjectSchema),
  ProjectController.update
);
router.delete(
  "/:id",
  authMiddleware,
  authorise("admin", "lead"),
  validate(idParamSchema),
  ProjectController.remove
);

module.exports = router;
