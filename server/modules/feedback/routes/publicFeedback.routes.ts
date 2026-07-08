// modules/feedback/routes/publicFeedback.routes.ts
// Unauthenticated endpoints for the embeddable public feedback form.
// The project's feedback_token (a UUID) is the only credential.
import { FeedbackController } from "../controllers/feedback.controller";
import { publicFormParamSchema, submitFeedbackSchema } from "../validators/feedback.schema";

const router = require("express").Router();
const rateLimit = require("express-rate-limit");
const { validate } = require("../../../shared/middleware/validate.middleware");
const { uploadMany } = require("../../../shared/middleware/upload.middleware");

// Stricter than the app-wide limiter — this endpoint is on the open internet.
const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many submissions — please try again later", statusCode: 429 },
});

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

module.exports = router;
