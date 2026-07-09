// modules/appUpdate/entities/appUpdate.entity.ts
// A "what's new" announcement authored by the platform owner (superadmin).
// Company admins see unseen announcements once, in a modal.
import { EntitySchema } from "typeorm";

export type AppUpdateAudience = "all" | "admins" | "custom";

export interface AppUpdate {
  id: string;
  title: string;
  // Plain text; newlines render as bullet-ish paragraphs in the modal.
  body: string;
  // Who this announcement is visible to. "custom" restricts it to recipientIds.
  audience: AppUpdateAudience;
  // Only populated when audience === "custom".
  recipientIds: string[] | null;
  createdAt: Date;
  deletedAt: Date | null;
}

const AppUpdate = new EntitySchema<AppUpdate>({
  name: "AppUpdate",
  tableName: "app_updates",
  columns: {
    id: {
      type: "uuid",
      primary: true,
      generated: "uuid",
    },
    title: {
      type: "varchar",
      length: 200,
    },
    body: {
      type: "text",
    },
    audience: {
      type: "varchar",
      length: 10,
      default: "admins",
    },
    recipientIds: {
      name: "recipient_ids",
      type: "uuid",
      array: true,
      nullable: true,
    },
    createdAt: {
      name: "created_at",
      type: "timestamptz",
      createDate: true,
    },
    deletedAt: {
      name: "deleted_at",
      type: "timestamptz",
      deleteDate: true,
      nullable: true,
    },
  },
  indices: [{ name: "idx_app_updates_created", columns: ["createdAt"] }],
});

export { AppUpdate };
