// modules/feedback/routes/publicFeedback.routes.ts
// Unauthenticated endpoints for the embeddable public feedback form.
// The project's feedback_token (a UUID) is the only credential.
import { FeedbackController } from "../controllers/feedback.controller";
import { FeedbackCommentController } from "../controllers/feedbackComment.controller";
import {
  publicFormParamSchema,
  submitFeedbackSchema,
  publicCompanyTicketsSchema,
  requestMyTicketsCodeSchema,
  listMyTicketsSchema,
  publicFetchCommentsSchema,
  publicAddCommentSchema,
  submitRatingSchema,
} from "../validators/feedback.schema";

const router = require("express").Router();
const { publicRoute } = require("../../../shared/access/can");
const rateLimit = require("express-rate-limit");
const { validate } = require("../../../shared/middleware/validate.middleware");
const { uploadMany, uploadCommentAttachments } = require("../../../shared/middleware/upload.middleware");
const { authRateLimiter } = require("../../../shared/middleware/rateLimiter.middleware");

// Stricter than the app-wide limiter — this endpoint is on the open internet.
const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many submissions — please try again later", statusCode: 429 },
});

// A comment thread is a back-and-forth, not a one-shot submission — looser
// than submitLimiter so a real conversation doesn't get throttled, but still
// well below anything a script could use to brute-force the OTP code (that's
// separately rate-limited via authRateLimiter on /my-tickets/code).
const commentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests — please try again shortly", statusCode: 429 },
});

// A partner's own dashboard, refreshing/paging more often than a one-shot
// submission would — looser than submitLimiter, same ceiling as commentLimiter.
const listTicketsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests — please try again shortly", statusCode: 429 },
});

// A submitter's own ticket history, no account — email a code (same rate
// limit as the auth module's own OTP flows), then trade it for the list;
// reusable until it expires, not single-use, so refreshing the page doesn't
// need a new one. Registered before the "/:token" routes below — otherwise
// "/my-tickets" would match that single-segment param route first.
router.post(
  "/my-tickets/code", publicRoute("Submitter ticket history — email + one-time code"),
  authRateLimiter,
  validate(requestMyTicketsCodeSchema),
  FeedbackController.requestMyTicketsCode
);
router.post(
  "/my-tickets", publicRoute("Submitter ticket history — email + one-time code"),
  authRateLimiter,
  validate(listMyTicketsSchema),
  FeedbackController.listMyTickets
);

router.get("/:token", publicRoute("Token-gated public form"), validate(publicFormParamSchema), FeedbackController.publicForm);
// Multipart: up to 5 optional screenshots. File middleware must run before
// validate() so the non-file fields exist on req.body.
router.post(
  "/:token", publicRoute("Token-gated public form"),
  submitLimiter,
  uploadMany("images", 5),
  validate(submitFeedbackSchema),
  FeedbackController.publicSubmit
);

// Everything raised against this token's form — a partner's own dashboard,
// not a single submitter's history (that's /my-tickets above).
router.get(
  "/:token/tickets", publicRoute("Token-gated public form"),
  listTicketsLimiter,
  validate(publicCompanyTicketsSchema),
  FeedbackController.publicListTickets
);

// Ticket comment thread — the submitter proves ownership the same way
// "My Tickets" does (email + the emailed OTP code, sent in the body so it
// never lands in a URL/query string or a server log).
router.post(
  "/:id/comments/view", publicRoute("Token-gated ticket thread"),
  commentLimiter,
  validate(publicFetchCommentsSchema),
  FeedbackCommentController.publicList
);
router.post(
  "/:id/comments", publicRoute("Token-gated ticket thread"),
  commentLimiter,
  uploadCommentAttachments("attachments"),
  validate(publicAddCommentSchema),
  FeedbackCommentController.publicCreate
);

// A resolved ticket's one-time satisfaction rating, from the "My Tickets"
// page — same email/code proof of ownership as /my-tickets above.
router.post(
  "/:id/rating", publicRoute("Token-gated satisfaction rating"),
  commentLimiter,
  validate(submitRatingSchema),
  FeedbackController.submitRating
);

module.exports = router;
