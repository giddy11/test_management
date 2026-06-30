// modules/activity/routes/activity.routes.js
const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { authorise } = require("../../../shared/middleware/authorise.middleware");
const { fetchActivitySchema } = require("../validators/activity.schema");
const { ActivityController } = require("../controllers/activity.controller");

// Audit trail — admins and superadmins only.
router.get(
  "/",
  authMiddleware,
  authorise("superadmin", "admin"),
  validate(fetchActivitySchema),
  ActivityController.fetchAll
);

module.exports = router;
