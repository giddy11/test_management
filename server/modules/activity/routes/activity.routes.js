// modules/activity/routes/activity.routes.js
const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { requirePermission } = require("../../../shared/access/can");
const {
  fetchActivitySchema,
  exportActivitySchema,
} = require("../validators/activity.schema");
const { ActivityController } = require("../controllers/activity.controller");

// Audit trail — admins, superadmins, and IT support (scoped to their own
// client company by the service layer).
//
// There is no POST, PATCH or DELETE here, and there never should be: the log is
// append-only, written only from inside the services whose changes it records.
router.get(
  "/",
  authMiddleware,
  requirePermission("audit.read"),
  validate(fetchActivitySchema),
  ActivityController.fetchAll
);

// Same permission and the same service-layer scoping as the list — the export
// is the list, so it must not be reachable by anyone who cannot read the page.
router.get(
  "/export",
  authMiddleware,
  requirePermission("audit.read"),
  validate(exportActivitySchema),
  ActivityController.exportAll
);

module.exports = router;
