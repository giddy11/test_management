// modules/serviceDesk/routes/publicServiceDesk.routes.ts
// Mounted at /api/v1/public/service-desk. Unauthenticated by design: a
// fulfilment connector (Power Automate, Logic Apps, n8n…) reports the result of
// a request it was sent. It proves itself with the one-time token in the
// callback URL TestMate gave it — 64 hex characters, checked against a stored
// hash, valid only while that run is waiting — and is rate limited per IP.
import { ServiceDeskController as C } from "../controllers/serviceDesk.controller";
import { callbackSchema } from "../validators/serviceDesk.schema";

const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { publicRoute } = require("../../../shared/access/can");
const { buildLimiter } = require("../../../shared/middleware/rateLimiter.middleware");

const callbackLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: "Too many callbacks, please slow down",
});

router.post(
  "/callbacks/:runId/:token",
  publicRoute("IT-request connector callback — token-gated"),
  callbackLimiter,
  validate(callbackSchema),
  C.callback
);

module.exports = router;
