// modules/feedback/routes/feedbackSupport.routes.ts — the IT support portal.
// Only it_support accounts; the service additionally scopes every query to the
// supporter's own client company.
import { FeedbackSupportController } from "../controllers/feedbackSupport.controller";
import {
  supportQueueSchema,
  updateSupportStatusSchema,
  supportItemParamSchema,
  resolveSupportSchema,
  escalateSupportSchema,
  notifySubmitterSchema,
} from "../validators/feedback.schema";

const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { authorise } = require("../../../shared/middleware/authorise.middleware");

const supportOnly = [authMiddleware, authorise("it_support")];

router.get("/", ...supportOnly, validate(supportQueueSchema), FeedbackSupportController.fetchQueue);
// Working-stage progression (logged → acknowledged → investigating), strictly sequential.
router.patch(
  "/:id",
  ...supportOnly,
  validate(updateSupportStatusSchema),
  FeedbackSupportController.updateStatus
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

module.exports = router;
