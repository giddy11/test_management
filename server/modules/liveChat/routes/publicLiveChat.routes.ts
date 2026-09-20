// modules/liveChat/routes/publicLiveChat.routes.ts
// Unauthenticated endpoints for the embeddable widget. A project's
// live_chat_token (a UUID) is the only credential for the project itself;
// the visitorId issued by /visitors is the credential for everything after.
import { LiveChatController } from "../controllers/liveChat.controller";
import {
  widgetTokenParamSchema,
  startVisitorSchema,
  registerAccountSchema,
  loginAccountSchema,
  sendVisitorMessageSchema,
  fetchVisitorMessagesSchema,
  getVisitorConversationSchema,
  markReadByVisitorSchema,
  updateContactSchema,
} from "../validators/liveChat.schema";

const router = require("express").Router();
const { publicRoute } = require("../../../shared/access/can");
const rateLimit = require("express-rate-limit");
const { validate } = require("../../../shared/middleware/validate.middleware");
const { uploadMany } = require("../../../shared/middleware/upload.middleware");

// This is on the open internet — a back-and-forth conversation needs a looser
// limit than a one-shot form submission, but still well below anything a
// script could use to spam a project's inbox. Mirrors publicFeedback's
// commentLimiter.
const messageLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many messages — please try again shortly", statusCode: 429 },
});

// Widget bootstrap / presence pings — read-mostly, but still capped.
const sessionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests — please try again shortly", statusCode: 429 },
});

// Password auth on the open internet — same bar as the main app's
// authRateLimiter, to slow brute-forcing a visitor account's password.
const accountAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many attempts — please try again later", statusCode: 429 },
});

router.get("/:token", publicRoute("Token-gated embeddable widget"), sessionLimiter, validate(widgetTokenParamSchema), LiveChatController.widgetConfig);

router.post(
  "/:token/visitors", publicRoute("Token-gated embeddable widget"),
  sessionLimiter,
  validate(startVisitorSchema),
  LiveChatController.startVisitor
);

// Account sign-in — the opt-in alternative to the anonymous flow above (see
// LiveChatSettings.requireAccount). Both return the same visitor shape
// startVisitor does, so the widget's post-bootstrap code doesn't need to care
// which front door was used.
router.post(
  "/:token/auth/register", publicRoute("Token-gated embeddable widget"),
  accountAuthLimiter,
  validate(registerAccountSchema),
  LiveChatController.registerAccount
);
router.post(
  "/:token/auth/login", publicRoute("Token-gated embeddable widget"),
  accountAuthLimiter,
  validate(loginAccountSchema),
  LiveChatController.loginAccount
);

router.post(
  "/:token/messages", publicRoute("Token-gated embeddable widget"),
  messageLimiter,
  uploadMany("images", 5),
  validate(sendVisitorMessageSchema),
  LiveChatController.sendVisitorMessage
);
// POST, not GET — visitorId is the credential, kept out of a query string/log.
router.post(
  "/:token/messages/view", publicRoute("Token-gated embeddable widget"),
  sessionLimiter,
  validate(fetchVisitorMessagesSchema),
  LiveChatController.fetchVisitorMessages
);
// The widget's bootstrap/refresh call — resolves the conversation id it needs
// to open a Firestore realtime listener.
router.post(
  "/:token/conversation", publicRoute("Token-gated embeddable widget"),
  sessionLimiter,
  validate(getVisitorConversationSchema),
  LiveChatController.getVisitorConversation
);
router.post(
  "/:token/read", publicRoute("Token-gated embeddable widget"),
  sessionLimiter,
  validate(markReadByVisitorSchema),
  LiveChatController.markReadByVisitor
);
router.post(
  "/:token/contact", publicRoute("Token-gated embeddable widget"),
  messageLimiter,
  validate(updateContactSchema),
  LiveChatController.updateContact
);

module.exports = router;
