// modules/siteBanner/routes/siteBanner.routes.ts
import { SiteBannerController } from "../controllers/siteBanner.controller";
import { activateSiteBannerSchema } from "../validators/siteBanner.schema";

const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { requireAuthenticatedOnly, requirePermission } = require("../../../shared/access/can");

// Every authenticated role must be able to read the current banner.
router.get("/current", authMiddleware, requireAuthenticatedOnly("Every authenticated user must see the current banner"), SiteBannerController.getCurrent);

// Only the platform owner can broadcast to every user.
router.post(
  "/activate",
  authMiddleware,
  requirePermission("banner.publish"),
  validate(activateSiteBannerSchema),
  SiteBannerController.activate
);
router.post("/deactivate", authMiddleware, requirePermission("banner.publish"), SiteBannerController.deactivate);

module.exports = router;
