// modules/appUpdate/entities/appUpdate.entity.ts
// A "what's new" announcement authored by the platform owner (superadmin).
// Company admins see unseen announcements once, in a modal.
import { EntitySchema } from "typeorm";

export interface AppUpdate {
  id: string;
  title: string;
  // Plain text; newlines render as bullet-ish paragraphs in the modal.
  body: string;
  createdAt: Date;
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
    createdAt: {
      name: "created_at",
      type: "timestamptz",
      createDate: true,
    },
  },
  indices: [{ name: "idx_app_updates_created", columns: ["createdAt"] }],
});

export { AppUpdate };
