// modules/pricing/routes/pricing.routes.ts
// The platform owner's editor for the landing page's pricing section.
import { PricingController } from "../controllers/pricing.controller";
import { updatePricingSchema } from "../validators/pricing.schema";

const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { requirePermission } = require("../../../shared/access/can");

router.get("/", authMiddleware, requirePermission("pricing.manage"), PricingController.get);
router.put("/", authMiddleware, requirePermission("pricing.manage"), validate(updatePricingSchema), PricingController.update);
router.delete("/", authMiddleware, requirePermission("pricing.manage"), PricingController.reset);

module.exports = router;
