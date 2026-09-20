// modules/supportChat/routes/supportChat.routes.js
const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { requireAuthenticatedOnly, requirePermission } = require("../../../shared/access/can");
const { uploadMany } = require("../../../shared/middleware/upload.middleware");
const {
  setSettingsSchema,
  sendMessageSchema,
  conversationMessageSchema,
  idParamSchema,
  listConversationsSchema,
  fetchMessagesSchema,
  setStatusSchema,
} = require("../validators/supportChat.schema");
const { SupportChatController } = require("../controllers/supportChat.controller");

// ── Global on/off toggle ─────────────────────────────────────────────────────
// Any internal user reads it (the floater checks before rendering); only super
// admins can change it.
router.get(
  "/settings",
  authMiddleware,
  requireAuthenticatedOnly("Reads the global on/off toggle before rendering the floater"),
  SupportChatController.getSettings
);
router.patch(
  "/settings",
  authMiddleware,
  requirePermission("settings.manage"),
  validate(setSettingsSchema),
  SupportChatController.setSettings
);

// ── User side — any internal user can reach the super admins ─────────────────
router.get(
  "/me/conversation",
  authMiddleware,
  requireAuthenticatedOnly("Own conversation"),
  SupportChatController.myConversation
);
router.post(
  "/me/messages",
  authMiddleware,
  requireAuthenticatedOnly("Own conversation"),
  uploadMany("images", 5), // multipart image attachments (no-op for JSON requests)
  validate(sendMessageSchema),
  SupportChatController.sendMyMessage
);
router.post(
  "/me/read",
  authMiddleware,
  requireAuthenticatedOnly("Own conversation"),
  SupportChatController.markMyRead
);

// ── Super-admin side — the inbox ─────────────────────────────────────────────
router.get(
  "/conversations",
  authMiddleware,
  requirePermission("supportchat.read"),
  validate(listConversationsSchema),
  SupportChatController.listConversations
);
router.get(
  "/conversations/:id/messages",
  authMiddleware,
  requirePermission("supportchat.read"),
  validate(fetchMessagesSchema),
  SupportChatController.fetchMessages
);
router.post(
  "/conversations/:id/messages",
  authMiddleware,
  requirePermission("supportchat.send"),
  uploadMany("images", 5), // multipart image attachments (no-op for JSON requests)
  validate(conversationMessageSchema),
  SupportChatController.sendAdminMessage
);
router.post(
  "/conversations/:id/read",
  authMiddleware,
  requirePermission("supportchat.read"),
  validate(idParamSchema),
  SupportChatController.markAdminRead
);
router.patch(
  "/conversations/:id",
  authMiddleware,
  requirePermission("supportchat.manage"),
  validate(setStatusSchema),
  SupportChatController.setStatus
);

module.exports = router;
