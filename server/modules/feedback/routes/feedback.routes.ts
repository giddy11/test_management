// modules/feedback/routes/feedback.routes.ts — authenticated feedback triage.
import { FeedbackController } from "../controllers/feedback.controller";
import { FeedbackCommentController } from "../controllers/feedbackComment.controller";
import {
  fetchFeedbackSchema,
  manageFeedbackSchema,
  feedbackIdParamSchema,
  feedbackLinkSchema,
  fetchFeedbackCommentsSchema,
  addFeedbackCommentSchema,
  testMateSupportTicketSchema,
} from "../validators/feedback.schema";

const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { requireProjectAccess, requireAuthenticatedOnly } = require("../../../shared/access/can");
const { uploadCommentAttachments } = require("../../../shared/middleware/upload.middleware");

// projectId omitted => cross-project view (role-scoped in the service).
router.get(
  "/",
  authMiddleware,
  requireProjectAccess("Customer tickets — decided by role in the project"),
  validate(fetchFeedbackSchema),
  FeedbackController.fetchAll
);

// Status/assignment changes: admins + the project's team leads (service-enforced).
router.patch(
  "/:id",
  authMiddleware,
  requireProjectAccess("Customer tickets — decided by role in the project"),
  validate(manageFeedbackSchema),
  FeedbackController.manage
);

router.get(
  "/:id/history",
  authMiddleware,
  requireProjectAccess("Customer tickets — decided by role in the project"),
  validate(feedbackIdParamSchema),
  FeedbackController.history
);

// Deleting is a management decision — admins + the project's team lead only
// (service-enforced, same bar as reassignment).
router.delete(
  "/:id",
  authMiddleware,
  requireProjectAccess("Customer tickets — decided by role in the project"),
  validate(feedbackIdParamSchema),
  FeedbackController.remove
);

// Ticket comment thread — same access bar as managing the ticket: admins,
// the project's team lead, or an assignee can post; any project member who
// can already see the ticket can read the thread.
router.get(
  "/:id/comments",
  authMiddleware,
  requireProjectAccess("Customer tickets — decided by role in the project"),
  validate(fetchFeedbackCommentsSchema),
  FeedbackCommentController.list
);
router.post(
  "/:id/comments",
  authMiddleware,
  requireProjectAccess("Customer tickets — decided by role in the project"),
  uploadCommentAttachments("attachments"),
  validate(addFeedbackCommentSchema),
  FeedbackCommentController.create
);

// TestMate's own in-app WhatsApp widget — any signed-in user (including
// external IT supporters) can contact TestMate support, so no permission
// beyond being authenticated.
router.post(
  "/testmate-support",
  authMiddleware,
  requireAuthenticatedOnly("Contact TestMate support — own ticket, details from own account"),
  validate(testMateSupportTicketSchema),
  FeedbackController.testMateSupport
);

// Enabling/rotating/disabling a project's public form link — admins only.
router.post(
  "/projects/:id/link",
  authMiddleware,
  requireProjectAccess("Customer tickets — decided by role in the project"),
  validate(feedbackLinkSchema),
  FeedbackController.setLink
);

module.exports = router;
