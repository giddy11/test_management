// modules/liveChat/entities/liveChatAccount.entity.ts
// A real, password-based account for a project's live-chat widget — the
// opt-in alternative to the anonymous pre-chat form (see
// LiveChatSettings.requireAccount). Scoped per project like everything else
// in this module: the same email can hold separate accounts on two
// different projects' widgets. Password auth only, no email verification —
// deliberately lighter-weight than the main app's user accounts, since this
// gates a chat widget, not the product itself.
import { EntitySchema } from "typeorm";

export interface LiveChatAccount {
  id: string;
  projectId: string;
  email: string;
  password: string;
  name: string;
  phone: string | null;
  createdAt: Date;
  lastLoginAt: Date | null;
  project?: unknown;
}

const LiveChatAccount = new EntitySchema<LiveChatAccount>({
  name: "LiveChatAccount",
  tableName: "live_chat_accounts",
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
    email: {
      type: "varchar",
      length: 255,
    },
    password: {
      type: "varchar",
      length: 255,
    },
    name: {
      type: "varchar",
      length: 120,
    },
    phone: {
      type: "varchar",
      length: 30,
      nullable: true,
    },
    createdAt: {
      name: "created_at",
      type: "timestamptz",
      createDate: true,
    },
    lastLoginAt: {
      name: "last_login_at",
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
  },
  indices: [
    // Login lookup + the "one account per email per project" rule (see the
    // migration's unique index — this is the same index, declared here too
    // so TypeORM's metadata matches reality).
    { name: "idx_live_chat_accounts_project_email", columns: ["projectId", "email"], unique: true },
  ],
});

export { LiveChatAccount };
