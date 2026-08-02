// modules/liveChat/controllers/liveChat.controller.ts
// Shared by two route files, same split as FeedbackController: the public
// (unauthenticated, token-gated) widget routes use the visitor-facing
// methods; the authenticated project-scoped routes use the staff-facing ones.
import { LiveChatService } from "../services/liveChat.service";
import {
  toVisitorResponse,
  toConversationResponse,
  toMessageResponse,
  toSettingsResponse,
} from "../dto/liveChat.dto";

const { ApiResponse } = require("../../../shared/response/apiResponse");

export class LiveChatController {
  // ── Public (widget) ─────────────────────────────────────────────────────────

  static async widgetConfig(req: any, res: any, next: any) {
    try {
      const config = await LiveChatService.Instance.getWidgetConfig(req.validated.params.token);
      res.status(200).json(ApiResponse.ok("Widget config", config));
    } catch (err) {
      next(err);
    }
  }

  static async startVisitor(req: any, res: any, next: any) {
    try {
      const visitor = await LiveChatService.Instance.startVisitor(
        req.validated.params.token,
        req.validated.body
      );
      res.status(200).json(ApiResponse.ok("Visitor session started", toVisitorResponse(visitor)));
    } catch (err) {
      next(err);
    }
  }

  static async sendVisitorMessage(req: any, res: any, next: any) {
    try {
      const message = await LiveChatService.Instance.sendVisitorMessage(
        req.validated.params.token,
        req.validated.body.visitorId,
        req.validated.body.body,
        req.files
      );
      res.status(201).json(ApiResponse.created("Message sent", toMessageResponse(message)));
    } catch (err) {
      next(err);
    }
  }

  static async fetchVisitorMessages(req: any, res: any, next: any) {
    try {
      const { visitorId, page, limit } = req.validated.body;
      const result = await LiveChatService.Instance.fetchMessagesForVisitor(
        req.validated.params.token,
        visitorId,
        { page, limit }
      );
      res
        .status(200)
        .json(ApiResponse.ok("Messages fetched", result.data.map(toMessageResponse), result.meta));
    } catch (err) {
      next(err);
    }
  }

  static async getVisitorConversation(req: any, res: any, next: any) {
    try {
      const conversation = await LiveChatService.Instance.getVisitorConversation(
        req.validated.params.token,
        req.validated.body.visitorId
      );
      res.status(200).json(ApiResponse.ok("Conversation fetched", toConversationResponse(conversation)));
    } catch (err) {
      next(err);
    }
  }

  static async markReadByVisitor(req: any, res: any, next: any) {
    try {
      await LiveChatService.Instance.markReadByVisitor(
        req.validated.params.token,
        req.validated.body.visitorId
      );
      res.status(200).json(ApiResponse.ok("Marked read", null));
    } catch (err) {
      next(err);
    }
  }

  static async updateContact(req: any, res: any, next: any) {
    try {
      const { visitorId, ...data } = req.validated.body;
      const visitor = await LiveChatService.Instance.updateContact(
        req.validated.params.token,
        visitorId,
        data
      );
      res.status(200).json(ApiResponse.ok("Contact updated", toVisitorResponse(visitor)));
    } catch (err) {
      next(err);
    }
  }

  // ── Staff (operator inbox) ───────────────────────────────────────────────────

  static async listConversations(req: any, res: any, next: any) {
    try {
      const result = await LiveChatService.Instance.listConversations(req.user, req.validated.query);
      res
        .status(200)
        .json(
          ApiResponse.ok("Conversations fetched", result.data.map(toConversationResponse), result.meta)
        );
    } catch (err) {
      next(err);
    }
  }

  static async fetchMessages(req: any, res: any, next: any) {
    try {
      const result = await LiveChatService.Instance.fetchMessages(
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

  static async sendAgentMessage(req: any, res: any, next: any) {
    try {
      const message = await LiveChatService.Instance.sendAgentMessage(
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

  static async markReadByAgent(req: any, res: any, next: any) {
    try {
      await LiveChatService.Instance.markReadByAgent(req.user, req.validated.params.id);
      res.status(200).json(ApiResponse.ok("Marked read", null));
    } catch (err) {
      next(err);
    }
  }

  static async assignAgent(req: any, res: any, next: any) {
    try {
      const conversation = await LiveChatService.Instance.assignAgent(
        req.user,
        req.validated.params.id,
        req.validated.body.agentId
      );
      res.status(200).json(ApiResponse.ok("Conversation assigned", toConversationResponse(conversation)));
    } catch (err) {
      next(err);
    }
  }

  static async setStatus(req: any, res: any, next: any) {
    try {
      const conversation = await LiveChatService.Instance.setStatus(
        req.user,
        req.validated.params.id,
        req.validated.body.status
      );
      res.status(200).json(ApiResponse.ok("Conversation updated", toConversationResponse(conversation)));
    } catch (err) {
      next(err);
    }
  }

  static async listVisitors(req: any, res: any, next: any) {
    try {
      const result = await LiveChatService.Instance.listVisitors(req.user, req.validated.query);
      res.status(200).json(ApiResponse.ok("Visitors fetched", result.data.map(toVisitorResponse), result.meta));
    } catch (err) {
      next(err);
    }
  }

  static async getSettings(req: any, res: any, next: any) {
    try {
      const settings = await LiveChatService.Instance.getSettings(req.user, req.validated.params.id);
      res.status(200).json(ApiResponse.ok("Settings fetched", toSettingsResponse(settings)));
    } catch (err) {
      next(err);
    }
  }

  static async updateSettings(req: any, res: any, next: any) {
    try {
      const settings = await LiveChatService.Instance.updateSettings(
        req.user,
        req.validated.params.id,
        req.validated.body
      );
      res.status(200).json(ApiResponse.ok("Settings updated", toSettingsResponse(settings)));
    } catch (err) {
      next(err);
    }
  }

  static async setLink(req: any, res: any, next: any) {
    try {
      const result = await LiveChatService.Instance.setWidgetLink(
        req.user,
        req.validated.params.id,
        req.validated.body.enabled
      );
      res.status(200).json(ApiResponse.ok("Live chat link updated", result));
    } catch (err) {
      next(err);
    }
  }
}
