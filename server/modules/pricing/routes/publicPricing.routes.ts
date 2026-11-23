// modules/pricing/routes/publicPricing.routes.ts
// Read-only pricing for the public landing page. No login, no token: it's the
// same marketing content for every visitor.
import { PricingController } from "../controllers/pricing.controller";

const router = require("express").Router();
const { publicRoute } = require("../../../shared/access/can");

router.get("/", publicRoute("Landing page pricing is shown to anonymous visitors"), PricingController.getPublic);

module.exports = router;
