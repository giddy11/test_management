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
} from "../validators/feedback.schema";

const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { authorise } = require("../../../shared/middleware/authorise.middleware");
const { uploadCommentAttachments } = require("../../../shared/middleware/upload.middleware");

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

// Ticket comment thread — same access bar as managing the ticket: admins,
// the project's team lead, or an assignee can post; any project member who
// can already see the ticket can read the thread.
router.get(
  "/:id/comments",
  authMiddleware,
  authorise("superadmin", "admin", "user"),
  validate(fetchFeedbackCommentsSchema),
  FeedbackCommentController.list
);
router.post(
  "/:id/comments",
  authMiddleware,
  authorise("superadmin", "admin", "user"),
  uploadCommentAttachments("attachments"),
  validate(addFeedbackCommentSchema),
  FeedbackCommentController.create
);

// Enabling/rotating/disabling a project's public form link — admins only.
router.post(
  "/projects/:id/link",
  authMiddleware,
  authorise("superadmin", "admin"),
  validate(feedbackLinkSchema),
  FeedbackController.setLink
);

module.exports = router;
