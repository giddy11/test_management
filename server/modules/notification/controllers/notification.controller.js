// modules/notification/controllers/notification.controller.js
const { NotificationService } = require("../services/notification.service");
const { ApiResponse } = require("../../../shared/response/apiResponse");
const { toNotificationResponse } = require("../dto/notification.dto");

class NotificationController {
  static async fetchAll(req, res, next) {
    try {
      const result = await NotificationService.Instance.fetch(
        req.user.id,
        req.validated.query
      );
      res
        .status(200)
        .json(
          ApiResponse.ok(
            "Notifications fetched",
            result.data.map(toNotificationResponse),
            result.meta
          )
        );
    } catch (err) {
      next(err);
    }
  }

  static async unreadCount(req, res, next) {
    try {
      const count = await NotificationService.Instance.unreadCount(req.user.id);
      res.status(200).json(ApiResponse.ok("Unread count", { count }));
    } catch (err) {
      next(err);
    }
  }

  static async markRead(req, res, next) {
    try {
      await NotificationService.Instance.markRead(req.validated.params.id, req.user.id);
      res.status(200).json(ApiResponse.ok("Marked as read", null));
    } catch (err) {
      next(err);
    }
  }

  static async markAllRead(req, res, next) {
    try {
      await NotificationService.Instance.markAllRead(req.user.id);
      res.status(200).json(ApiResponse.ok("All marked as read", null));
    } catch (err) {
      next(err);
    }
  }
}

module.exports = { NotificationController };
