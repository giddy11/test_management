// app.js — Express application wiring.
require("reflect-metadata");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");

const { env } = require("./config/env");
const { ApiResponse } = require("./shared/response/apiResponse");
const { apiRateLimiter } = require("./shared/middleware/rateLimiter.middleware");
const {
  notFoundHandler,
  globalErrorHandler,
} = require("./shared/middleware/errorHandler.middleware");

// Module routers
const authRoutes = require("./modules/auth/routes/auth.routes");
const userRoutes = require("./modules/user/routes/user.routes");
const projectRoutes = require("./modules/project/routes/project.routes");
const testSuiteRoutes = require("./modules/testSuite/routes/testSuite.routes");
const testCaseRoutes = require("./modules/testCase/routes/testCase.routes");
const testCaseAttachmentRoutes = require("./modules/testCase/routes/testCaseAttachment.routes");
const testCaseImportRoutes = require("./modules/testCase/routes/testCaseImport.routes");
const testRunRoutes = require("./modules/testRun/routes/testRun.routes");
const testRunResultRoutes = require("./modules/testRunResult/routes/testRunResult.routes");
const dashboardRoutes = require("./modules/dashboard/routes/dashboard.routes");
const notificationRoutes = require("./modules/notification/routes/notification.routes");
const activityRoutes = require("./modules/activity/routes/activity.routes");
const featureRequestRoutes = require("./modules/featureRequest/routes/featureRequest.routes");

function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigins.length ? env.corsOrigins : true,
      credentials: true,
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));

  // Health check
  app.get("/health", (req, res) => {
    res.status(200).json(ApiResponse.ok("OK", { status: "up", env: env.nodeEnv }));
  });

  // Versioned API
  const api = express.Router();
  api.use(apiRateLimiter);
  api.use("/auth", authRoutes);
  api.use("/users", userRoutes);
  api.use("/projects", projectRoutes);
  api.use("/test-suites", testSuiteRoutes);
  api.use("/test-cases", testCaseImportRoutes); // /template, /import — before /:id
  api.use("/test-cases", testCaseAttachmentRoutes); // /:id/attachments — mounted first
  api.use("/test-cases", testCaseRoutes);
  api.use("/test-runs", testRunRoutes);
  api.use("/test-run-results", testRunResultRoutes);
  api.use("/dashboard", dashboardRoutes);
  api.use("/notifications", notificationRoutes);
  api.use("/activity", activityRoutes);
  api.use("/feature-requests", featureRequestRoutes);
  app.use("/api/v1", api);

  // 404 + centralised error handling
  app.use(notFoundHandler);
  app.use(globalErrorHandler);

  return app;
}

module.exports = { createApp };
