// modules/supportChat/controllers/supportChat.controller.js
const { SupportChatService } = require("../services/supportChat.service");
const { ApiResponse } = require("../../../shared/response/apiResponse");
const { toConversationResponse, toMessageResponse } = require("../dto/supportChat.dto");

class SupportChatController {
  // ── Global toggle ────────────────────────────────────────────────────────────
  static async getSettings(req, res, next) {
    try {
      const settings = await SupportChatService.Instance.getSettings();
      res.status(200).json(ApiResponse.ok("Settings fetched", settings));
    } catch (err) {
      next(err);
    }
  }

  static async setSettings(req, res, next) {
    try {
      const settings = await SupportChatService.Instance.setEnabled(
        req.user,
        req.validated.body.enabled
      );
      res.status(200).json(ApiResponse.ok("Settings updated", settings));
    } catch (err) {
      next(err);
    }
  }

  // ── User side ──────────────────────────────────────────────────────────────
  static async myConversation(req, res, next) {
    try {
      const conversation = await SupportChatService.Instance.getMyConversation(req.user);
      res
        .status(200)
        .json(ApiResponse.ok("Conversation fetched", toConversationResponse(conversation)));
    } catch (err) {
      next(err);
    }
  }

  static async sendMyMessage(req, res, next) {
    try {
      const message = await SupportChatService.Instance.sendUserMessage(
        req.user,
        req.validated.body.body,
        req.files
      );
      res.status(201).json(ApiResponse.created("Message sent", toMessageResponse(message)));
    } catch (err) {
      next(err);
    }
  }

  static async markMyRead(req, res, next) {
    try {
      await SupportChatService.Instance.markReadByUser(req.user);
      res.status(200).json(ApiResponse.ok("Marked read", null));
    } catch (err) {
      next(err);
    }
  }

  // ── Super-admin side ─────────────────────────────────────────────────────────
  static async listConversations(req, res, next) {
    try {
      const result = await SupportChatService.Instance.listConversations(
        req.user,
        req.validated.query
      );
      res
        .status(200)
        .json(
          ApiResponse.ok(
            "Conversations fetched",
            result.data.map(toConversationResponse),
            result.meta
          )
        );
    } catch (err) {
      next(err);
    }
  }

  static async fetchMessages(req, res, next) {
    try {
      const result = await SupportChatService.Instance.fetchMessages(
        req.user,
        req.validated.params.id,
        req.validated.query
      );
      res
        .status(200)
        .json(ApiResponse.ok("Messages fetched", result.data.map(toMessageResponse), result.meta));
    } catch (err) {
      next(err);
    }
  }

  static async sendAdminMessage(req, res, next) {
    try {
      const message = await SupportChatService.Instance.sendAdminMessage(
        req.user,
        req.validated.params.id,
        req.validated.body.body,
        req.files
      );
      res.status(201).json(ApiResponse.created("Reply sent", toMessageResponse(message)));
    } catch (err) {
      next(err);
    }
  }

  static async markAdminRead(req, res, next) {
    try {
      await SupportChatService.Instance.markReadByAdmin(req.user, req.validated.params.id);
      res.status(200).json(ApiResponse.ok("Marked read", null));
    } catch (err) {
      next(err);
    }
  }

  static async setStatus(req, res, next) {
    try {
      const conversation = await SupportChatService.Instance.setStatus(
        req.user,
        req.validated.params.id,
        req.validated.body.status
      );
      res
        .status(200)
        .json(ApiResponse.ok("Conversation updated", toConversationResponse(conversation)));
    } catch (err) {
      next(err);
    }
  }
}

module.exports = { SupportChatController };
