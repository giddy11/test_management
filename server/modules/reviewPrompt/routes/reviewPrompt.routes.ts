// modules/reviewPrompt/routes/reviewPrompt.routes.ts
import { ReviewPromptController } from "../controllers/reviewPrompt.controller";
import { updateReviewPromptSettingsSchema } from "../validators/reviewPrompt.schema";

const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { requireAuthenticatedOnly, requirePermission } = require("../../../shared/access/can");

// Anyone signed in may ask; they only ever get items they reported themselves.
router.post(
  "/claim",
  authMiddleware,
  requireAuthenticatedOnly("Each user only gets the items they reported"),
  ReviewPromptController.claim
);

// The platform owner sets the interval for everyone.
router.get("/settings", authMiddleware, requirePermission("reviewprompt.manage"), ReviewPromptController.getSettings);
router.put(
  "/settings",
  authMiddleware,
  requirePermission("reviewprompt.manage"),
  validate(updateReviewPromptSettingsSchema),
  ReviewPromptController.updateSettings
);

module.exports = router;
