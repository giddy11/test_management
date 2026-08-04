// modules/liveChat/entities/liveChatVisitor.entity.ts
// A person interacting with a project's embedded live-chat widget
// (projects.live_chat_token). Scoped per project — the same physical visitor
// on two different projects' widgets gets two separate rows, since identity
// isn't shared across projects. The row is created on the visitor's first
// widget load (id generated server-side, then persisted client-side so it
// survives return visits) and doubles as the lightweight CRM record: name/
// email are filled in via the pre-chat form (or blank for anonymous mode),
// and persist across conversations so an agent can see a repeat visitor's
// history.
//
// If the project requires real accounts (LiveChatSettings.requireAccount),
// accountId links back to the LiveChatAccount that logged into this row —
// resolved once at login/register time, same visitor row reused on every
// later visit/device (unlike anonymous mode, where a cleared browser or a
// different device means a brand new, unrelated visitor row).
import { EntitySchema } from "typeorm";

export interface LiveChatVisitor {
  id: string;
  projectId: string;
  accountId: string | null;
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
  account?: unknown;
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
    accountId: {
      name: "account_id",
      type: "uuid",
      nullable: true,
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
    // At most one visitor row per account (enforced by a partial unique
    // index — see the migration) — logging in on a new device resolves back
    // to this same row instead of creating a new one.
    account: {
      type: "many-to-one",
      target: "LiveChatAccount",
      joinColumn: { name: "account_id" },
      onDelete: "SET NULL",
      nullable: true,
    },
  },
  indices: [
    { name: "idx_live_chat_visitors_project", columns: ["projectId"] },
    { name: "idx_live_chat_visitors_email", columns: ["email"] },
  ],
});

export { LiveChatVisitor };
