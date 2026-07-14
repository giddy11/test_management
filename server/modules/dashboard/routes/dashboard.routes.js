// modules/dashboard/routes/dashboard.routes.js
const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { authorise } = require("../../../shared/middleware/authorise.middleware");
const { overviewSchema, recentRunsSchema } = require("../validators/dashboard.schema");
const { DashboardController } = require("../controllers/dashboard.controller");

router.get("/overview", authMiddleware, authorise("superadmin", "admin", "user"), validate(overviewSchema), DashboardController.overview);
router.get("/recent-runs", authMiddleware, authorise("superadmin", "admin", "user"), validate(recentRunsSchema), DashboardController.recentRuns);

module.exports = router;
