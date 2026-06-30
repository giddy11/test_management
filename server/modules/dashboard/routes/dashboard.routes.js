// modules/dashboard/routes/dashboard.routes.js
const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { overviewSchema } = require("../validators/dashboard.schema");
const { DashboardController } = require("../controllers/dashboard.controller");

router.get("/overview", authMiddleware, validate(overviewSchema), DashboardController.overview);

module.exports = router;
