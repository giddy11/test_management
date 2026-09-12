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
const { authorise } = require("../../../shared/middleware/authorise.middleware");

const viewers = [authMiddleware, authorise("superadmin", "admin", "user", "it_support")];
const editors = [authMiddleware, authorise("superadmin", "admin")];

router.get("/overview", ...viewers, validate(slaFiltersSchema), SlaController.overview);
router.get("/tickets", ...viewers, validate(slaTicketsSchema), SlaController.tickets);
router.get("/filters", ...viewers, SlaController.filterOptions);
router.get("/settings", ...viewers, SlaController.getSettings);
router.put("/settings", ...editors, validate(updateSlaSettingsSchema), SlaController.updateSettings);

module.exports = router;
