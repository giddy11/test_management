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
const { requireProjectAccess } = require("../../../shared/access/can");
const { uploadMany } = require("../../../shared/middleware/upload.middleware");

// projectId is required (unlike feedback's cross-project mode) — the inbox is
// always viewed one project's widget at a time. Membership is service-enforced.
router.get(
  "/conversations",
  authMiddleware,
  requireProjectAccess("Live chat — decided by role in the project"),
  validate(fetchConversationsSchema),
  LiveChatController.listConversations
);
router.get(
  "/conversations/:id/messages",
  authMiddleware,
  requireProjectAccess("Live chat — decided by role in the project"),
  validate(fetchMessagesSchema),
  LiveChatController.fetchMessages
);
router.post(
  "/conversations/:id/messages",
  authMiddleware,
  requireProjectAccess("Live chat — decided by role in the project"),
  uploadMany("images", 5), // multipart image attachments (no-op for JSON requests)
  validate(sendAgentMessageSchema),
  LiveChatController.sendAgentMessage
);
router.post(
  "/conversations/:id/read",
  authMiddleware,
  requireProjectAccess("Live chat — decided by role in the project"),
  validate(conversationIdParamSchema),
  LiveChatController.markReadByAgent
);
router.patch(
  "/conversations/:id/assign",
  authMiddleware,
  requireProjectAccess("Live chat — decided by role in the project"),
  validate(assignAgentSchema),
  LiveChatController.assignAgent
);
router.patch(
  "/conversations/:id",
  authMiddleware,
  requireProjectAccess("Live chat — decided by role in the project"),
  validate(setStatusSchema),
  LiveChatController.setStatus
);

// The visitor/CRM list.
router.get(
  "/visitors",
  authMiddleware,
  requireProjectAccess("Live chat — decided by role in the project"),
  validate(listVisitorsSchema),
  LiveChatController.listVisitors
);

// Per-project widget presentation config.
router.get(
  "/projects/:id/settings",
  authMiddleware,
  requireProjectAccess("Live chat — decided by role in the project"),
  validate(projectIdParamSchema),
  LiveChatController.getSettings
);
router.patch(
  "/projects/:id/settings",
  authMiddleware,
  requireProjectAccess("Live chat — decided by role in the project"),
  validate(updateSettingsSchema),
  LiveChatController.updateSettings
);

// Enabling/rotating/disabling a project's widget link — admins only, same bar
// as the feedback module's equivalent route.
router.post(
  "/projects/:id/link",
  authMiddleware,
  requireProjectAccess("Live chat — decided by role in the project"),
  validate(liveChatLinkSchema),
  LiveChatController.setLink
);

module.exports = router;
