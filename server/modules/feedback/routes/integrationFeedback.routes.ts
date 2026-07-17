// modules/feedback/routes/integrationFeedback.routes.ts
// Server-to-server ticket API for partner products (e.g. DOMS): create a
// ticket on the partner's behalf, then look one up or list a submitter's
// history. Auth is a per-client-company x-api-key (see apiKeyAuth.middleware),
// not the public form token — this is machine traffic, not a browser form.
// Tickets land in that company's IT support queue, exactly like a form
// submission through their public link.
import { FeedbackController } from "../controllers/feedback.controller";
import {
  integrationCreateTicketSchema,
  integrationListTicketsSchema,
  integrationTicketIdParamSchema,
} from "../validators/feedback.schema";

const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { apiKeyAuth } = require("../middleware/apiKeyAuth.middleware");
const { buildLimiter } = require("../../../shared/middleware/rateLimiter.middleware");

// Rate limiter runs before apiKeyAuth, same ordering as publicFeedback.routes.ts —
// throttles key-guessing attempts too, not just legitimate traffic.
const integrationWriteLimiter = buildLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: "Too many requests — please slow down",
});
const integrationReadLimiter = buildLimiter({
  windowMs: 60 * 1000,
  max: 120,
  message: "Too many requests — please slow down",
});

router.post(
  "/",
  integrationWriteLimiter,
  apiKeyAuth,
  validate(integrationCreateTicketSchema),
  FeedbackController.integrationCreate
);

router.get(
  "/",
  integrationReadLimiter,
  apiKeyAuth,
  validate(integrationListTicketsSchema),
  FeedbackController.integrationList
);

router.get(
  "/:id",
  integrationReadLimiter,
  apiKeyAuth,
  validate(integrationTicketIdParamSchema),
  FeedbackController.integrationGet
);

module.exports = router;
