// modules/feedback/routes/publicFeedback.routes.ts
// Unauthenticated endpoints for the embeddable public feedback form.
// The project's feedback_token (a UUID) is the only credential.
import { FeedbackController } from "../controllers/feedback.controller";
import {
  publicFormParamSchema,
  submitFeedbackSchema,
  feedbackIdParamSchema,
  submitConfirmationSchema,
  requestMyTicketsCodeSchema,
  listMyTicketsSchema,
} from "../validators/feedback.schema";

const router = require("express").Router();
const rateLimit = require("express-rate-limit");
const { validate } = require("../../../shared/middleware/validate.middleware");
const { uploadMany } = require("../../../shared/middleware/upload.middleware");
const { authRateLimiter } = require("../../../shared/middleware/rateLimiter.middleware");

// Stricter than the app-wide limiter — this endpoint is on the open internet.
const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many submissions — please try again later", statusCode: 429 },
});

// A submitter's own ticket history, no account — email a code (same rate
// limit as the auth module's own OTP flows), then trade it for the list;
// reusable until it expires, not single-use, so refreshing the page doesn't
// need a new one. Registered before the "/:token" routes below — otherwise
// "/my-tickets" would match that single-segment param route first.
router.post(
  "/my-tickets/code",
  authRateLimiter,
  validate(requestMyTicketsCodeSchema),
  FeedbackController.requestMyTicketsCode
);
router.post(
  "/my-tickets",
  authRateLimiter,
  validate(listMyTicketsSchema),
  FeedbackController.listMyTickets
);

router.get("/:token", validate(publicFormParamSchema), FeedbackController.publicForm);
// Multipart: up to 5 optional screenshots. File middleware must run before
// validate() so the non-file fields exist on req.body.
router.post(
  "/:token",
  submitLimiter,
  uploadMany("images", 5),
  validate(submitFeedbackSchema),
  FeedbackController.publicSubmit
);

// Confirmation link from the "awaiting confirmation" status email — the
// feedback id itself is the (unguessable UUID) credential, same trust model
// as the project's feedback_token above.
router.get(
  "/:id/confirm",
  validate(feedbackIdParamSchema),
  FeedbackController.publicConfirmationContext
);
router.post(
  "/:id/confirm",
  submitLimiter,
  validate(submitConfirmationSchema),
  FeedbackController.publicConfirm
);

module.exports = router;
