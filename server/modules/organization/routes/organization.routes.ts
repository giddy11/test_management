// modules/organization/routes/organization.routes.ts
import { OrganizationController } from "../controllers/organization.controller";
import { fetchOrganizationsSchema } from "../validators/organization.schema";

const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { requirePermission } = require("../../../shared/access/can");

// Cross-org overview — the platform owner's eyes-only.
router.get(
  "/",
  authMiddleware,
  requirePermission("platform.read"),
  validate(fetchOrganizationsSchema),
  OrganizationController.fetchAll
);

module.exports = router;
