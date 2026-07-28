// modules/feedback/routes/feedbackSupport.routes.ts — the IT support portal.
// Only it_support accounts; the service additionally scopes every query to the
// supporter's own client company.
import { FeedbackSupportController } from "../controllers/feedbackSupport.controller";
import { FeedbackCommentController } from "../controllers/feedbackComment.controller";
import {
  supportQueueSchema,
  updateSupportStatusSchema,
  supportItemParamSchema,
  resolveSupportSchema,
  escalateSupportSchema,
  notifySubmitterSchema,
  assignSupportItemSchema,
  fetchFeedbackCommentsSchema,
  addFeedbackCommentSchema,
} from "../validators/feedback.schema";

const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { authorise } = require("../../../shared/middleware/authorise.middleware");
const { uploadCommentAttachments } = require("../../../shared/middleware/upload.middleware");

const supportOnly = [authMiddleware, authorise("it_support")];

router.get("/", ...supportOnly, validate(supportQueueSchema), FeedbackSupportController.fetchQueue);
// Leads only (service-enforced) — the teammate list for the assign dropdown.
router.get("/teammates", ...supportOnly, FeedbackSupportController.teammates);
// Working-stage progression (logged → acknowledged → investigating), strictly sequential.
router.patch(
  "/:id",
  ...supportOnly,
  validate(updateSupportStatusSchema),
  FeedbackSupportController.updateStatus
);
// Leads only (service-enforced) — route an item to a teammate, or unassign.
router.patch(
  "/:id/assign",
  ...supportOnly,
  validate(assignSupportItemSchema),
  FeedbackSupportController.assign
);
router.get(
  "/:id/history",
  ...supportOnly,
  validate(supportItemParamSchema),
  FeedbackSupportController.history
);
router.post(
  "/:id/resolve",
  ...supportOnly,
  validate(resolveSupportSchema),
  FeedbackSupportController.resolve
);
router.post(
  "/:id/escalate",
  ...supportOnly,
  validate(escalateSupportSchema),
  FeedbackSupportController.escalate
);
router.post(
  "/:id/notify-submitter",
  ...supportOnly,
  validate(notifySubmitterSchema),
  FeedbackSupportController.notifySubmitter
);

// Ticket comment thread — same underlying thread as the product-team routes;
// the service checks the assigned supporter/lead bar for posting, any of the
// company's supporters can read.
router.get(
  "/:id/comments",
  ...supportOnly,
  validate(fetchFeedbackCommentsSchema),
  FeedbackCommentController.list
);
router.post(
  "/:id/comments",
  ...supportOnly,
  uploadCommentAttachments("attachments"),
  validate(addFeedbackCommentSchema),
  FeedbackCommentController.create
);

module.exports = router;
