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
const { authorise } = require("../../../shared/middleware/authorise.middleware");
const { uploadMany } = require("../../../shared/middleware/upload.middleware");

// projectId is required (unlike feedback's cross-project mode) — the inbox is
// always viewed one project's widget at a time. Membership is service-enforced.
router.get(
  "/conversations",
  authMiddleware,
  authorise("superadmin", "admin", "user"),
  validate(fetchConversationsSchema),
  LiveChatController.listConversations
);
router.get(
  "/conversations/:id/messages",
  authMiddleware,
  authorise("superadmin", "admin", "user"),
  validate(fetchMessagesSchema),
  LiveChatController.fetchMessages
);
router.post(
  "/conversations/:id/messages",
  authMiddleware,
  authorise("superadmin", "admin", "user"),
  uploadMany("images", 5), // multipart image attachments (no-op for JSON requests)
  validate(sendAgentMessageSchema),
  LiveChatController.sendAgentMessage
);
router.post(
  "/conversations/:id/read",
  authMiddleware,
  authorise("superadmin", "admin", "user"),
  validate(conversationIdParamSchema),
  LiveChatController.markReadByAgent
);
router.patch(
  "/conversations/:id/assign",
  authMiddleware,
  authorise("superadmin", "admin", "user"),
  validate(assignAgentSchema),
  LiveChatController.assignAgent
);
router.patch(
  "/conversations/:id",
  authMiddleware,
  authorise("superadmin", "admin", "user"),
  validate(setStatusSchema),
  LiveChatController.setStatus
);

// The visitor/CRM list.
router.get(
  "/visitors",
  authMiddleware,
  authorise("superadmin", "admin", "user"),
  validate(listVisitorsSchema),
  LiveChatController.listVisitors
);

// Per-project widget presentation config.
router.get(
  "/projects/:id/settings",
  authMiddleware,
  authorise("superadmin", "admin", "user"),
  validate(projectIdParamSchema),
  LiveChatController.getSettings
);
router.patch(
  "/projects/:id/settings",
  authMiddleware,
  authorise("superadmin", "admin", "user"),
  validate(updateSettingsSchema),
  LiveChatController.updateSettings
);

// Enabling/rotating/disabling a project's widget link — admins only, same bar
// as the feedback module's equivalent route.
router.post(
  "/projects/:id/link",
  authMiddleware,
  authorise("superadmin", "admin"),
  validate(liveChatLinkSchema),
  LiveChatController.setLink
);

module.exports = router;
