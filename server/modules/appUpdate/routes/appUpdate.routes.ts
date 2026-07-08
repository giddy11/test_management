// modules/appUpdate/routes/appUpdate.routes.ts
import { AppUpdateController } from "../controllers/appUpdate.controller";
import { createAppUpdateSchema } from "../validators/appUpdate.schema";

const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { authorise } = require("../../../shared/middleware/authorise.middleware");

// Publishing announcements is the platform owner's job.
router.get("/", authMiddleware, authorise("superadmin"), AppUpdateController.fetchAll);
router.post(
  "/",
  authMiddleware,
  authorise("superadmin"),
  validate(createAppUpdateSchema),
  AppUpdateController.create
);

// Company admins (and the superadmin) see the what's-new modal.
router.get(
  "/unseen",
  authMiddleware,
  authorise("superadmin", "admin"),
  AppUpdateController.fetchUnseen
);
router.post(
  "/seen",
  authMiddleware,
  authorise("superadmin", "admin"),
  AppUpdateController.markSeen
);

module.exports = router;
