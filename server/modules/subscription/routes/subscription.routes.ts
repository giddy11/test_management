// modules/subscription/routes/subscription.routes.ts
import { SubscriptionController as C } from "../controllers/subscription.controller";
import {
  organizationParamSchema,
  recordPaymentSchema,
  setPlanSchema,
  updateEntitlementsSchema,
} from "../validators/subscription.schema";

const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { requireAuthenticatedOnly, requirePermission } = require("../../../shared/access/can");

const MANAGE = "subscription.manage";

// Everyone in an organisation may see which plan it is on, so the app can show
// what's included and lock what isn't.
router.get("/me", authMiddleware, requireAuthenticatedOnly("Every member sees their organisation's plan"), C.mine);

// The platform owner: what each plan unlocks, and each organisation's plan.
router.get("/catalog", authMiddleware, requirePermission(MANAGE), C.catalog);
router.put("/entitlements", authMiddleware, requirePermission(MANAGE), validate(updateEntitlementsSchema), C.updateEntitlements);
router.get("/organizations/:organizationId", authMiddleware, requirePermission(MANAGE), validate(organizationParamSchema), C.organization);
router.put("/organizations/:organizationId/plan", authMiddleware, requirePermission(MANAGE), validate(setPlanSchema), C.setPlan);
router.post("/organizations/:organizationId/payments", authMiddleware, requirePermission(MANAGE), validate(recordPaymentSchema), C.recordPayment);

module.exports = router;
