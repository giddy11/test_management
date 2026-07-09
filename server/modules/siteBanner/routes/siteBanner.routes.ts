// modules/siteBanner/routes/siteBanner.routes.ts
import { SiteBannerController } from "../controllers/siteBanner.controller";
import { activateSiteBannerSchema } from "../validators/siteBanner.schema";

const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { authorise } = require("../../../shared/middleware/authorise.middleware");

// Every authenticated role must be able to read the current banner.
router.get("/current", authMiddleware, SiteBannerController.getCurrent);

// Only the platform owner can broadcast to every user.
router.post(
  "/activate",
  authMiddleware,
  authorise("superadmin"),
  validate(activateSiteBannerSchema),
  SiteBannerController.activate
);
router.post("/deactivate", authMiddleware, authorise("superadmin"), SiteBannerController.deactivate);

module.exports = router;
