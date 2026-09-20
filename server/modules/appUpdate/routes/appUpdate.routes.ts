// modules/appUpdate/routes/appUpdate.routes.ts
import { AppUpdateController } from "../controllers/appUpdate.controller";
import {
  createAppUpdateSchema,
  createBulkAppUpdateSchema,
  deleteBulkAppUpdateSchema,
} from "../validators/appUpdate.schema";

const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { requireAuthenticatedOnly, requirePermission } = require("../../../shared/access/can");

// Publishing announcements is the platform owner's job.
router.get("/", authMiddleware, requirePermission("announcement.manage"), AppUpdateController.fetchAll);
router.post(
  "/",
  authMiddleware,
  requirePermission("announcement.manage"),
  validate(createAppUpdateSchema),
  AppUpdateController.create
);
// Publish several announcements in one action.
router.post(
  "/bulk",
  authMiddleware,
  requirePermission("announcement.manage"),
  validate(createBulkAppUpdateSchema),
  AppUpdateController.createBulk
);
// Delete several published updates in one action.
router.delete(
  "/bulk",
  authMiddleware,
  requirePermission("announcement.manage"),
  validate(deleteBulkAppUpdateSchema),
  AppUpdateController.deleteBulk
);

// Any authenticated user can see the what's-new modal — visibility of the
// underlying announcements is filtered by audience in the service/repository.
router.get("/unseen", authMiddleware, requireAuthenticatedOnly("Own what's-new state"), AppUpdateController.fetchUnseen);
router.post("/seen", authMiddleware, requireAuthenticatedOnly("Own what's-new state"), AppUpdateController.markSeen);

module.exports = router;
