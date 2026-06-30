// modules/notification/routes/notification.routes.js
const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const {
  fetchNotificationsSchema,
  idParamSchema,
} = require("../validators/notification.schema");
const { NotificationController } = require("../controllers/notification.controller");

router.get("/", authMiddleware, validate(fetchNotificationsSchema), NotificationController.fetchAll);
router.get("/unread-count", authMiddleware, NotificationController.unreadCount);
router.patch("/read-all", authMiddleware, NotificationController.markAllRead);
router.patch("/:id/read", authMiddleware, validate(idParamSchema), NotificationController.markRead);

module.exports = router;
