// modules/notification/routes/notification.routes.js
const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { requireAuthenticatedOnly } = require("../../../shared/access/can");
const {
  fetchNotificationsSchema,
  idParamSchema,
} = require("../validators/notification.schema");
const { NotificationController } = require("../controllers/notification.controller");

router.get("/", authMiddleware, requireAuthenticatedOnly("Own notifications"), validate(fetchNotificationsSchema), NotificationController.fetchAll);
router.get("/unread-count", authMiddleware, requireAuthenticatedOnly("Own notifications"), NotificationController.unreadCount);
router.patch("/read-all", authMiddleware, requireAuthenticatedOnly("Own notifications"), NotificationController.markAllRead);
router.patch("/:id/read", authMiddleware, requireAuthenticatedOnly("Own notifications"), validate(idParamSchema), NotificationController.markRead);

module.exports = router;
