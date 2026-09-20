// modules/access/routes/access.routes.js
// Roles & access. Reading the catalog and the role list needs role.read;
// every write needs role.manage, which is effectively administrator-level
// because it can grant any permission (see AccessService.assertNoEscalation).
const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { requirePermission } = require("../../../shared/access/can");
const {
  roleIdParam,
  createRoleSchema,
  updateRoleSchema,
} = require("../validators/access.schema");
const { AccessController } = require("../controllers/access.controller");

// The catalog itself — categories, labels, descriptions and warning notes.
router.get("/permissions", authMiddleware, requirePermission("role.read"), AccessController.catalog);

router.get("/roles", authMiddleware, requirePermission("role.read"), AccessController.fetchRoles);
router.get(
  "/roles/:id",
  authMiddleware,
  requirePermission("role.read"),
  validate(roleIdParam),
  AccessController.fetchRole
);

router.post(
  "/roles",
  authMiddleware,
  requirePermission("role.manage"),
  validate(createRoleSchema),
  AccessController.createRole
);
router.patch(
  "/roles/:id",
  authMiddleware,
  requirePermission("role.manage"),
  validate(updateRoleSchema),
  AccessController.updateRole
);
router.delete(
  "/roles/:id",
  authMiddleware,
  requirePermission("role.manage"),
  validate(roleIdParam),
  AccessController.deleteRole
);

module.exports = router;
