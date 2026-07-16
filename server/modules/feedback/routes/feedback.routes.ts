// modules/feedback/routes/feedback.routes.ts — authenticated feedback triage.
import { FeedbackController } from "../controllers/feedback.controller";
import {
  fetchFeedbackSchema,
  manageFeedbackSchema,
  feedbackIdParamSchema,
  feedbackLinkSchema,
  integrationApiKeySchema,
} from "../validators/feedback.schema";

const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { authorise } = require("../../../shared/middleware/authorise.middleware");

// projectId omitted => cross-project view (role-scoped in the service).
router.get(
  "/",
  authMiddleware,
  authorise("superadmin", "admin", "user"),
  validate(fetchFeedbackSchema),
  FeedbackController.fetchAll
);

// Status/assignment changes: admins + the project's team leads (service-enforced).
router.patch(
  "/:id",
  authMiddleware,
  authorise("superadmin", "admin", "user"),
  validate(manageFeedbackSchema),
  FeedbackController.manage
);

router.get(
  "/:id/history",
  authMiddleware,
  authorise("superadmin", "admin", "user"),
  validate(feedbackIdParamSchema),
  FeedbackController.history
);

// Deleting is a management decision — admins + the project's team lead only
// (service-enforced, same bar as reassignment).
router.delete(
  "/:id",
  authMiddleware,
  authorise("superadmin", "admin", "user"),
  validate(feedbackIdParamSchema),
  FeedbackController.remove
);

// Enabling/rotating/disabling a project's public form link — admins only.
router.post(
  "/projects/:id/link",
  authMiddleware,
  authorise("superadmin", "admin"),
  validate(feedbackLinkSchema),
  FeedbackController.setLink
);

// Generate/rotate/revoke a project's partner integration API key — admins only.
router.post(
  "/projects/:id/integration-key",
  authMiddleware,
  authorise("superadmin", "admin"),
  validate(integrationApiKeySchema),
  FeedbackController.setIntegrationKey
);

module.exports = router;
