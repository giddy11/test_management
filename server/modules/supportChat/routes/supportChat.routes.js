// modules/supportChat/routes/supportChat.routes.js
const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { authorise } = require("../../../shared/middleware/authorise.middleware");
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
  authorise("superadmin", "admin", "user"),
  SupportChatController.getSettings
);
router.patch(
  "/settings",
  authMiddleware,
  authorise("superadmin"),
  validate(setSettingsSchema),
  SupportChatController.setSettings
);

// ── User side — any internal user can reach the super admins ─────────────────
router.get(
  "/me/conversation",
  authMiddleware,
  authorise("superadmin", "admin", "user"),
  SupportChatController.myConversation
);
router.post(
  "/me/messages",
  authMiddleware,
  authorise("superadmin", "admin", "user"),
  uploadMany("images", 5), // multipart image attachments (no-op for JSON requests)
  validate(sendMessageSchema),
  SupportChatController.sendMyMessage
);
router.post(
  "/me/read",
  authMiddleware,
  authorise("superadmin", "admin", "user"),
  SupportChatController.markMyRead
);

// ── Super-admin side — the inbox ─────────────────────────────────────────────
router.get(
  "/conversations",
  authMiddleware,
  authorise("superadmin"),
  validate(listConversationsSchema),
  SupportChatController.listConversations
);
router.get(
  "/conversations/:id/messages",
  authMiddleware,
  authorise("superadmin"),
  validate(fetchMessagesSchema),
  SupportChatController.fetchMessages
);
router.post(
  "/conversations/:id/messages",
  authMiddleware,
  authorise("superadmin"),
  uploadMany("images", 5), // multipart image attachments (no-op for JSON requests)
  validate(conversationMessageSchema),
  SupportChatController.sendAdminMessage
);
router.post(
  "/conversations/:id/read",
  authMiddleware,
  authorise("superadmin"),
  validate(idParamSchema),
  SupportChatController.markAdminRead
);
router.patch(
  "/conversations/:id",
  authMiddleware,
  authorise("superadmin"),
  validate(setStatusSchema),
  SupportChatController.setStatus
);

module.exports = router;
