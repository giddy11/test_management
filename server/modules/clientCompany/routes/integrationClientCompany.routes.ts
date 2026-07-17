// modules/clientCompany/routes/integrationClientCompany.routes.ts
// Server-to-server company provisioning for partner products: create a new
// client company (+ its first IT support lead) the moment that company signs
// up on the partner's side. Unauthenticated — the request identifies its
// target project directly via projectId in the body. Rate-limited as the
// only real guard against abuse; see the docs' security notes.
import { ClientCompanyController } from "../controllers/clientCompany.controller";
import { integrationProvisionCompanySchema } from "../validators/clientCompany.schema";

const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { buildLimiter } = require("../../../shared/middleware/rateLimiter.middleware");

// Company creation is rarer and more sensitive than ticket creation — tighter
// than integrationFeedback.routes.ts's ticket limiter.
const provisionLimiter = buildLimiter({
  windowMs: 60 * 1000,
  max: 20,
  message: "Too many requests — please slow down",
});

router.post(
  "/",
  provisionLimiter,
  validate(integrationProvisionCompanySchema),
  ClientCompanyController.integrationProvision
);

module.exports = router;
