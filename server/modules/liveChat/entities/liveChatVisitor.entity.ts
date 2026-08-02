// modules/liveChat/entities/liveChatVisitor.entity.ts
// An anonymous person interacting with a project's embedded live-chat widget
// (projects.live_chat_token). Scoped per project — the same physical visitor
// on two different projects' widgets gets two separate rows, since there's no
// shared login to unify them. The row is created on the visitor's first
// widget load (id generated server-side, then persisted client-side so it
// survives return visits) and doubles as the lightweight CRM record: name/
// email are filled in only if the visitor gives them, and persist across
// conversations so an agent can see a repeat visitor's history.
import { EntitySchema } from "typeorm";

export interface LiveChatVisitor {
  id: string;
  projectId: string;
  name: string | null;
  email: string | null;
  // E.164 (e.g. "+2348012345678") — same format as Feedback.submitterPhone.
  phone: string | null;
  // Denormalized "where are they right now" — refreshed on each widget
  // page-load ping, powers the operator dashboard's live-visitor view.
  currentUrl: string | null;
  referrer: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  project?: unknown;
}

const LiveChatVisitor = new EntitySchema<LiveChatVisitor>({
  name: "LiveChatVisitor",
  tableName: "live_chat_visitors",
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
    name: {
      type: "varchar",
      length: 120,
      nullable: true,
    },
    email: {
      type: "varchar",
      length: 255,
      nullable: true,
    },
    phone: {
      type: "varchar",
      length: 30,
      nullable: true,
    },
    currentUrl: {
      name: "current_url",
      type: "varchar",
      length: 2048,
      nullable: true,
    },
    referrer: {
      type: "varchar",
      length: 2048,
      nullable: true,
    },
    firstSeenAt: {
      name: "first_seen_at",
      type: "timestamptz",
      createDate: true,
    },
    lastSeenAt: {
      name: "last_seen_at",
      type: "timestamptz",
    },
  },
  relations: {
    project: {
      type: "many-to-one",
      target: "Project",
      joinColumn: { name: "project_id" },
      onDelete: "CASCADE",
    },
  },
  indices: [
    { name: "idx_live_chat_visitors_project", columns: ["projectId"] },
    { name: "idx_live_chat_visitors_email", columns: ["email"] },
  ],
});

export { LiveChatVisitor };
