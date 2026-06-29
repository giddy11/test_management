// modules/user/routes/user.routes.js
const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { authorise } = require("../../../shared/middleware/authorise.middleware");
const {
  createUserSchema,
  updateUserSchema,
  idParamSchema,
  fetchUsersSchema,
} = require("../validators/user.schema");
const { UserController } = require("../controllers/user.controller");

// Company member management — admins and superadmins only.
router.get(
  "/",
  authMiddleware,
  authorise("superadmin", "admin"),
  validate(fetchUsersSchema),
  UserController.fetchAll
);
router.get(
  "/:id",
  authMiddleware,
  authorise("superadmin", "admin"),
  validate(idParamSchema),
  UserController.fetchById
);
router.post(
  "/",
  authMiddleware,
  authorise("superadmin", "admin"),
  validate(createUserSchema),
  UserController.create
);
router.patch(
  "/:id",
  authMiddleware,
  authorise("superadmin", "admin"),
  validate(updateUserSchema),
  UserController.update
);
router.delete(
  "/:id",
  authMiddleware,
  authorise("superadmin", "admin"),
  validate(idParamSchema),
  UserController.remove
);

module.exports = router;
