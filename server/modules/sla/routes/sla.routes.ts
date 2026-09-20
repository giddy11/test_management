// modules/sla/routes/sla.routes.ts — SLA tracking dashboard & analytics.
// RBAC: admins/superadmins see their whole organisation, plain users (QA)
// only the projects they're members of, IT supporters only their own
// company's tickets — the service narrows each (see SlaService.scopeFor).
// Editing the SLA rules is admin-only.
import { SlaController } from "../controllers/sla.controller";
import { slaFiltersSchema, slaTicketsSchema, updateSlaSettingsSchema } from "../validators/sla.schema";

const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { requirePermission } = require("../../../shared/access/can");


router.get("/overview", authMiddleware, requirePermission("sla.read"), validate(slaFiltersSchema), SlaController.overview);
router.get("/tickets", authMiddleware, requirePermission("sla.read"), validate(slaTicketsSchema), SlaController.tickets);
router.get("/filters", authMiddleware, requirePermission("sla.read"), SlaController.filterOptions);
router.get("/settings", authMiddleware, requirePermission("sla.read"), SlaController.getSettings);
router.put("/settings", authMiddleware, requirePermission("sla.configure"), validate(updateSlaSettingsSchema), SlaController.updateSettings);

module.exports = router;
