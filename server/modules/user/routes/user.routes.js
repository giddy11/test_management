// modules/user/routes/user.routes.js
const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { requirePermission } = require("../../../shared/access/can");
const {
  createUserSchema,
  updateUserSchema,
  idParamSchema,
  fetchUsersSchema,
} = require("../validators/user.schema");
const { UserController } = require("../controllers/user.controller");
const { setUserRolesSchema } = require("../../access/validators/access.schema");

// Listing company members — any authenticated member (e.g. project leads picking
// assignees) needs this; mutation routes below stay admin/superadmin only.
router.get(
  "/",
  authMiddleware,
  requirePermission("user.read"),
  validate(fetchUsersSchema),
  UserController.fetchAll
);
router.get(
  "/:id",
  authMiddleware,
  requirePermission("user.read"),
  validate(idParamSchema),
  UserController.fetchById
);
router.post(
  "/",
  authMiddleware,
  requirePermission("user.create"),
  validate(createUserSchema),
  UserController.create
);
router.patch(
  "/:id",
  authMiddleware,
  requirePermission("user.update"),
  validate(updateUserSchema),
  UserController.update
);
router.delete(
  "/:id",
  authMiddleware,
  requirePermission("user.delete"),
  validate(idParamSchema),
  UserController.remove
);

// Role assignment lives on the user, but is gated on role.assign rather than
// user.update — editing someone's name is not the same privilege as changing
// what they may do. AccessService applies the lockout and no-escalation guards.
router.put(
  "/:id/roles",
  authMiddleware,
  requirePermission("role.assign"),
  validate(setUserRolesSchema),
  UserController.setRoles
);

module.exports = router;
