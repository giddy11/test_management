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
const {
  enforceDeclaredPermissions,
} = require("./shared/access/routeAudit");
const { publicRoute } = require("./shared/access/can");

// Module routers
const authRoutes = require("./modules/auth/routes/auth.routes");
const userRoutes = require("./modules/user/routes/user.routes");
const projectRoutes = require("./modules/project/routes/project.routes");
const testSuiteRoutes = require("./modules/testSuite/routes/testSuite.routes");
const testCaseRoutes = require("./modules/testCase/routes/testCase.routes");
const testCaseAttachmentRoutes = require("./modules/testCase/routes/testCaseAttachment.routes");
const testCaseNoteRoutes = require("./modules/testCase/routes/testCaseNote.routes");
const testCaseImportRoutes = require("./modules/testCase/routes/testCaseImport.routes");
const testRunRoutes = require("./modules/testRun/routes/testRun.routes");
const testRunResultRoutes = require("./modules/testRunResult/routes/testRunResult.routes");
const dashboardRoutes = require("./modules/dashboard/routes/dashboard.routes");
const notificationRoutes = require("./modules/notification/routes/notification.routes");
const activityRoutes = require("./modules/activity/routes/activity.routes");
const featureRequestRoutes = require("./modules/featureRequest/routes/featureRequest.routes");
const featureRequestAttachmentRoutes = require("./modules/featureRequest/routes/featureRequestAttachment.routes");
const bugRoutes = require("./modules/bug/routes/bug.routes");
const bugAttachmentRoutes = require("./modules/bug/routes/bugAttachment.routes");
const appUpdateRoutes = require("./modules/appUpdate/routes/appUpdate.routes");
const siteBannerRoutes = require("./modules/siteBanner/routes/siteBanner.routes");
const organizationRoutes = require("./modules/organization/routes/organization.routes");
const feedbackRoutes = require("./modules/feedback/routes/feedback.routes");
const publicFeedbackRoutes = require("./modules/feedback/routes/publicFeedback.routes");
const feedbackSupportRoutes = require("./modules/feedback/routes/feedbackSupport.routes");
const clientCompanyRoutes = require("./modules/clientCompany/routes/clientCompany.routes");
const integrationClientCompanyRoutes = require("./modules/clientCompany/routes/integrationClientCompany.routes");
const supportChatRoutes = require("./modules/supportChat/routes/supportChat.routes");
const liveChatRoutes = require("./modules/liveChat/routes/liveChat.routes");
const publicLiveChatRoutes = require("./modules/liveChat/routes/publicLiveChat.routes");
const slaRoutes = require("./modules/sla/routes/sla.routes");
const accessRoutes = require("./modules/access/routes/access.routes");
const searchRoutes = require("./modules/search/routes/search.routes");
const ticketLinkRoutes = require("./modules/ticketLink/routes/ticketLink.routes");

function createApp() {
  const app = express();

  // The app itself is restricted to its own known frontends (credentialed —
  // cookies/session-bearing requests). The public feedback API is different:
  // it's meant to be called directly from a THIRD PARTY's own frontend (a
  // partner building their own ticket form UI instead of sending users to
  // our hosted /feedback/:token page), so its origin can't be known ahead of
  // time. That's safe to open up — the same feedbackToken is already treated
  // as shareable in a plain URL, the routes take no cookies, and submission
  // is separately rate-limited (see publicFeedback.routes.ts).
  //
  // Two things gate a cross-origin browser read, and both default to
  // same-origin-only: the CORS headers (above) and helmet's
  // Cross-Origin-Resource-Policy header, which browsers enforce independently
  // of CORS — an open CORS policy alone still gets silently blocked in
  // Chrome/Firefox unless CORP also allows it. Both need the same carve-out.
  const isPublicFeedback = (req) => req.path.startsWith("/api/v1/public/feedback");

  const restrictedHelmet = helmet();
  const openHelmet = helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } });
  app.use((req, res, next) => (isPublicFeedback(req) ? openHelmet : restrictedHelmet)(req, res, next));

  const restrictedCors = cors({
    origin: env.corsOrigins.length ? env.corsOrigins : true,
    credentials: true,
  });
  const openCors = cors({ origin: true });
  app.use((req, res, next) => (isPublicFeedback(req) ? openCors : restrictedCors)(req, res, next));
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));

  // Health check — declared public like any other open route, so the
  // deny-by-default audit below covers the whole app and not just /api/v1.
  app.get("/health", publicRoute("Liveness probe"), (req, res) => {
    res.status(200).json(ApiResponse.ok("OK", { status: "up", env: env.nodeEnv }));
  });

  // Versioned API
  const api = express.Router();
  api.use(apiRateLimiter);
  api.use("/auth", authRoutes);
  api.use("/access", accessRoutes); // Roles & access (settings)
  api.use("/users", userRoutes);
  api.use("/search", searchRoutes); // global search across projects and their records
  api.use("/projects", projectRoutes);
  api.use("/test-suites", testSuiteRoutes);
  api.use("/test-cases", testCaseImportRoutes); // /template, /import — before /:id
  api.use("/test-cases", testCaseAttachmentRoutes); // /:id/attachments — mounted first
  api.use("/test-cases", testCaseNoteRoutes); // /:id/notes, /:id/run-notes
  api.use("/test-cases", testCaseRoutes);
  api.use("/test-runs", testRunRoutes);
  api.use("/test-run-results", testRunResultRoutes);
  api.use("/dashboard", dashboardRoutes);
  api.use("/sla", slaRoutes); // SLA tracking dashboard & analytics
  api.use("/notifications", notificationRoutes);
  api.use("/activity", activityRoutes);
  api.use("/feature-requests", featureRequestAttachmentRoutes); // /:id/attachments — mounted first
  api.use("/feature-requests", featureRequestRoutes);
  api.use("/bugs", bugAttachmentRoutes); // /:id/attachments — mounted first
  api.use("/bugs", bugRoutes);
  api.use("/ticket-links", ticketLinkRoutes); // relate bugs, feature requests and feedback tickets
  api.use("/app-updates", appUpdateRoutes);
  api.use("/site-banner", siteBannerRoutes);
  api.use("/organizations", organizationRoutes);
  api.use("/feedback", feedbackRoutes);
  api.use("/support/feedback", feedbackSupportRoutes); // it_support role only
  api.use("/client-companies", clientCompanyRoutes); // admin-only management
  api.use("/support-chat", supportChatRoutes); // in-app user <-> super-admin chat
  api.use("/live-chat", liveChatRoutes); // operator inbox for the embeddable widget
  api.use("/public/feedback", publicFeedbackRoutes); // unauthenticated, token-gated
  api.use("/public/live-chat", publicLiveChatRoutes); // unauthenticated, token-gated (widget)
  api.use("/integrations/companies", integrationClientCompanyRoutes); // server-to-server, unauthenticated
  app.use("/api/v1", api);

  // Deny by default: any route that forgot to declare a permission is spliced
  // with a denying handler here, and named loudly at boot. See routeAudit.js.
  const undeclared = enforceDeclaredPermissions(app._router, "");
  if (undeclared.length) {
    console.error(
      `[access] ${undeclared.length} route(s) declare no permission and are now blocked:`
    );
    for (const r of undeclared) console.error(`[access]   ${r.method} ${r.path}`);
  }

  // 404 + centralised error handling
  app.use(notFoundHandler);
  app.use(globalErrorHandler);

  return app;
}

module.exports = { createApp };
