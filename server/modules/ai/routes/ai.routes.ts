// modules/ai/routes/ai.routes.ts — AI drafting and the provider keys behind it.
//
// Key management exists twice with identical routes: /org/… for the
// organisation's keys (ai.managekeys) and /me/… for the caller's own (ai.ownkey).
// Routes that call the provider (saving a key verifies it; listing models)
// also go through aiRateLimiter, which must come AFTER authMiddleware so it
// can key on the user.
import { AiController } from "../controllers/ai.controller";
import { aiCredentialController } from "../controllers/aiCredential.controller";
import { AiCreditController } from "../controllers/aiCredit.controller";
import type { AiKeyScope } from "../services/aiCredential.service";
import {
  bugReportDraftSchema,
  featureRequestDraftSchema,
  usageReportSchema,
  clearCreditHistorySchema,
  creditAccountsSchema,
  creditPricesSchema,
  grantCreditsSchema,
  myCreditsSchema,
  featureParamsSchema,
  listModelsSchema,
  providerParamsSchema,
  saveCredentialSchema,
  setFeatureModelSchema,
  statusSchema,
} from "../validators/ai.schema";

const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { aiRateLimiter } = require("../../../shared/middleware/rateLimiter.middleware");
const { requirePermission } = require("../../../shared/access/can");

router.get("/status", authMiddleware, requirePermission("ai.use"), validate(statusSchema), AiController.status);

// Drafts. ai.use at the route; WHICH project the caller may draft for is their
// role in it, checked in the feature service (same rule as filing the record).
// Nothing is saved — the suggestion only fills the form.
router.post("/bug-report-draft", authMiddleware, requirePermission("ai.use"), aiRateLimiter, validate(bugReportDraftSchema), AiController.bugReportDraft);
router.post("/feature-request-draft", authMiddleware, requirePermission("ai.use"), aiRateLimiter, validate(featureRequestDraftSchema), AiController.featureRequestDraft);

function keyRoutes(base: string, permission: string, scope: AiKeyScope) {
  const c = aiCredentialController(scope);
  const guard = [authMiddleware, requirePermission(permission)];
  router.get(`${base}/credentials`, ...guard, c.list);
  router.put(`${base}/credentials/:provider`, ...guard, aiRateLimiter, validate(saveCredentialSchema), c.save);
  router.post(`${base}/credentials/:provider/models`, ...guard, aiRateLimiter, validate(listModelsSchema), c.models);
  router.post(`${base}/credentials/:provider/activate`, ...guard, validate(providerParamsSchema), c.activate);
  router.delete(`${base}/credentials/:provider`, ...guard, validate(providerParamsSchema), c.remove);
  router.put(`${base}/feature-models/:feature`, ...guard, validate(setFeatureModelSchema), c.setFeatureModel);
  router.delete(`${base}/feature-models/:feature`, ...guard, validate(featureParamsSchema), c.clearFeatureModel);
}

keyRoutes("/org", "ai.managekeys", "org");
// Usage report (counts only) for whoever manages the organisation's AI.
router.get("/org/usage", authMiddleware, requirePermission("ai.managekeys"), validate(usageReportSchema), AiController.usage);
keyRoutes("/me", "ai.ownkey", "own");

// Credits. Anyone who may use AI sees their own balance and history; the
// organisation's prices, balances and grants are ai.managecredits.
router.get("/me/credits", authMiddleware, requirePermission("ai.use"), validate(myCreditsSchema), AiCreditController.mine);
router.post("/me/credits/clear-history", authMiddleware, requirePermission("ai.use"), validate(clearCreditHistorySchema), AiCreditController.clearHistory);
router.get("/org/credits/accounts", authMiddleware, requirePermission("ai.managecredits"), validate(creditAccountsSchema), AiCreditController.accounts);
router.post("/org/credits/grants", authMiddleware, requirePermission("ai.managecredits"), validate(grantCreditsSchema), AiCreditController.grant);
router.get("/org/credits/prices", authMiddleware, requirePermission("ai.managecredits"), AiCreditController.prices);
router.put("/org/credits/prices", authMiddleware, requirePermission("ai.managecredits"), validate(creditPricesSchema), AiCreditController.updatePrices);

module.exports = router;
