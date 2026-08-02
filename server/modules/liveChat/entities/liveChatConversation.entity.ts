// modules/liveChat/entities/liveChatConversation.entity.ts
// One thread between an anonymous visitor and a project's staff, started from
// the embedded widget. Same Postgres/Firestore split as
// supportChatConversation.entity.js: this table drives the operator inbox
// (list, unread counts, status); the messages themselves live in Firestore
// (collection "liveChatMessages") for realtime delivery — see
// liveChatMessage.repository.ts.
import { EntitySchema } from "typeorm";
import { LiveChatStatus } from "../../../config/constants";

export interface LiveChatConversation {
  id: string;
  projectId: string;
  visitorId: string;
  status: string; // LiveChatStatus
  // Which staff member is handling this thread — null means unclaimed, shows
  // in the inbox's "unassigned" queue (same shape as Feedback.assignedSupporterId).
  assignedAgentId: string | null;
  // Denormalized from the latest Firestore message — powers the inbox list
  // ordering and preview without reading Firestore server-side.
  lastMessageAt: Date | null;
  lastMessagePreview: string | null;
  lastSenderRole: string | null; // "visitor" | "agent" | "bot"
  // Unread counters per side. visitorUnread = agent/bot messages the visitor
  // hasn't seen; agentUnread = visitor messages no staff member has seen yet.
  visitorUnread: number;
  agentUnread: number;
  createdAt: Date;
  closedAt: Date | null;
  project?: unknown;
  visitor?: unknown;
  assignedAgent?: { id: string; firstName: string; lastName: string | null; email: string } | null;
}

const LiveChatConversation = new EntitySchema<LiveChatConversation>({
  name: "LiveChatConversation",
  tableName: "live_chat_conversations",
  columns: {
    id: {
      type: "uuid",
      primary: true,
      generated: "uuid",
    },
    projectId: {
      name: "project_id",
      type: "uuid",
    },
    visitorId: {
      name: "visitor_id",
      type: "uuid",
    },
    status: {
      type: "varchar",
      length: 20,
      default: LiveChatStatus.OPEN,
    },
    assignedAgentId: {
      name: "assigned_agent_id",
      type: "uuid",
      nullable: true,
    },
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
    lastSenderRole: {
      name: "last_sender_role",
      type: "varchar",
      length: 20,
      nullable: true,
    },
    visitorUnread: {
      name: "visitor_unread",
      type: "integer",
      default: 0,
    },
    agentUnread: {
      name: "agent_unread",
      type: "integer",
      default: 0,
    },
    createdAt: {
      name: "created_at",
      type: "timestamptz",
      createDate: true,
    },
    closedAt: {
      name: "closed_at",
      type: "timestamptz",
      nullable: true,
    },
  },
  relations: {
    project: {
      type: "many-to-one",
      target: "Project",
      joinColumn: { name: "project_id" },
      onDelete: "CASCADE",
    },
    visitor: {
      type: "many-to-one",
      target: "LiveChatVisitor",
      joinColumn: { name: "visitor_id" },
      onDelete: "CASCADE",
    },
    assignedAgent: {
      type: "many-to-one",
      target: "User",
      joinColumn: { name: "assigned_agent_id" },
      onDelete: "SET NULL",
      nullable: true,
    },
  },
  indices: [
    // The operator inbox: a project's newest-active conversations first, filterable by status.
    {
      name: "idx_live_chat_conv_project_status_last_message",
      columns: ["projectId", "status", "lastMessageAt"],
    },
    { name: "idx_live_chat_conv_visitor", columns: ["visitorId"] },
    // "Assigned to me" / unassigned-queue filters within a project's inbox.
    { name: "idx_live_chat_conv_assigned_agent", columns: ["assignedAgentId"] },
  ],
});

export { LiveChatConversation };
