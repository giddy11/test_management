// modules/liveChat/routes/liveChat.routes.ts — authenticated operator inbox.
import { LiveChatController } from "../controllers/liveChat.controller";
import {
  fetchConversationsSchema,
  conversationIdParamSchema,
  fetchMessagesSchema,
  sendAgentMessageSchema,
  assignAgentSchema,
  setStatusSchema,
  listVisitorsSchema,
  projectIdParamSchema,
  updateSettingsSchema,
  liveChatLinkSchema,
} from "../validators/liveChat.schema";

const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { requirePermission } = require("../../../shared/access/can");
const { uploadMany } = require("../../../shared/middleware/upload.middleware");

// projectId is required (unlike feedback's cross-project mode) — the inbox is
// always viewed one project's widget at a time. Membership is service-enforced.
router.get(
  "/conversations",
  authMiddleware,
  requirePermission("livechat.read"),
  validate(fetchConversationsSchema),
  LiveChatController.listConversations
);
router.get(
  "/conversations/:id/messages",
  authMiddleware,
  requirePermission("livechat.read"),
  validate(fetchMessagesSchema),
  LiveChatController.fetchMessages
);
router.post(
  "/conversations/:id/messages",
  authMiddleware,
  requirePermission("livechat.send"),
  uploadMany("images", 5), // multipart image attachments (no-op for JSON requests)
  validate(sendAgentMessageSchema),
  LiveChatController.sendAgentMessage
);
router.post(
  "/conversations/:id/read",
  authMiddleware,
  requirePermission("livechat.read"),
  validate(conversationIdParamSchema),
  LiveChatController.markReadByAgent
);
router.patch(
  "/conversations/:id/assign",
  authMiddleware,
  requirePermission("livechat.assign"),
  validate(assignAgentSchema),
  LiveChatController.assignAgent
);
router.patch(
  "/conversations/:id",
  authMiddleware,
  requirePermission("livechat.manage"),
  validate(setStatusSchema),
  LiveChatController.setStatus
);

// The visitor/CRM list.
router.get(
  "/visitors",
  authMiddleware,
  requirePermission("livechat.read"),
  validate(listVisitorsSchema),
  LiveChatController.listVisitors
);

// Per-project widget presentation config.
router.get(
  "/projects/:id/settings",
  authMiddleware,
  requirePermission("livechat.read"),
  validate(projectIdParamSchema),
  LiveChatController.getSettings
);
router.patch(
  "/projects/:id/settings",
  authMiddleware,
  requirePermission("livechat.configure"),
  validate(updateSettingsSchema),
  LiveChatController.updateSettings
);

// Enabling/rotating/disabling a project's widget link — admins only, same bar
// as the feedback module's equivalent route.
router.post(
  "/projects/:id/link",
  authMiddleware,
  requirePermission("widget.configure"),
  validate(liveChatLinkSchema),
  LiveChatController.setLink
);

module.exports = router;
