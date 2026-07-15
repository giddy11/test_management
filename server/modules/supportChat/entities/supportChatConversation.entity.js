// modules/supportChat/entities/supportChatConversation.entity.js
// In-app support chat between an internal user and the platform's super admins.
// The conversation lives in Postgres (needed for the inbox list, unread counts
// and status); the messages themselves live in Firestore for realtime delivery
// (collection "supportChatMessages") — same split as feature-request comments.
const { EntitySchema } = require("typeorm");
const { SupportChatStatus } = require("../../../config/constants");

const SupportChatConversation = new EntitySchema({
  name: "SupportChatConversation",
  tableName: "support_chat_conversations",
  columns: {
    id: {
      type: "uuid",
      primary: true,
      generated: "uuid",
    },
    // The internal user who started the thread. Each user has at most one OPEN
    // conversation at a time (enforced in the service, not the DB — closed ones
    // may coexist as history).
    userId: {
      name: "user_id",
      type: "uuid",
    },
    status: {
      type: "varchar",
      length: 20,
      default: SupportChatStatus.OPEN,
    },
    // Denormalized from the latest Firestore message — powers the inbox list
    // ordering and preview without reading Firestore server-side.
    lastMessageAt: {
      name: "last_message_at",
      type: "timestamptz",
      nullable: true,
    },
    lastMessagePreview: {
      name: "last_message_preview",
      type: "varchar",
      length: 280,
      nullable: true,
    },
    // "user" | "admin" — direction of the most recent message.
    lastSenderRole: {
      name: "last_sender_role",
      type: "varchar",
      length: 20,
      nullable: true,
    },
    // Unread counters per side. userUnread = admin messages the user hasn't
    // seen; adminUnread = user messages no super admin has seen yet.
    userUnread: {
      name: "user_unread",
      type: "integer",
      default: 0,
    },
    adminUnread: {
      name: "admin_unread",
      type: "integer",
      default: 0,
    },
    createdAt: {
      name: "created_at",
      type: "timestamptz",
      createDate: true,
    },
  },
  relations: {
    user: {
      type: "many-to-one",
      target: "User",
      joinColumn: { name: "user_id" },
      onDelete: "CASCADE",
    },
  },
  indices: [
    // The super-admin inbox: newest-active conversations first, filterable by status.
    { name: "idx_support_chat_status_last_message", columns: ["status", "lastMessageAt"] },
    { name: "idx_support_chat_user", columns: ["userId"] },
  ],
});

module.exports = { SupportChatConversation };
