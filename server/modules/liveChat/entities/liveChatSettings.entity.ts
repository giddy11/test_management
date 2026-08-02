// modules/liveChat/entities/liveChatSettings.entity.ts
// Per-project widget configuration — one row per project, created lazily (see
// liveChatSettings.repository.ts's getOrCreate). The on/off switch itself is
// projects.live_chat_token (null = disabled), mirroring projects.feedback_token
// — this table only holds presentation/copy, not the gate, so there's exactly
// one source of truth for "is the widget enabled".
import { EntitySchema } from "typeorm";

export interface LiveChatSettings {
  projectId: string;
  // Widget header title, e.g. "Acme Support" — defaults to the project name if unset.
  displayName: string | null;
  logoUrl: string | null;
  // Shown as the pre-filled first bubble when a visitor opens the widget.
  greetingMessage: string | null;
  // Shown in place of the composer when no staff member is available —
  // backs the offline/contact-form fallback.
  offlineMessage: string | null;
  brandColor: string | null;
  updatedBy: string | null;
  updatedAt: Date;
  project?: unknown;
}

const LiveChatSettings = new EntitySchema<LiveChatSettings>({
  name: "LiveChatSettings",
  tableName: "live_chat_settings",
  columns: {
    projectId: {
      name: "project_id",
      type: "uuid",
      primary: true,
    },
    displayName: {
      name: "display_name",
      type: "varchar",
      length: 120,
      nullable: true,
    },
    logoUrl: {
      name: "logo_url",
      type: "varchar",
      length: 2048,
      nullable: true,
    },
    greetingMessage: {
      name: "greeting_message",
      type: "varchar",
      length: 500,
      nullable: true,
    },
    offlineMessage: {
      name: "offline_message",
      type: "varchar",
      length: 500,
      nullable: true,
    },
    brandColor: {
      name: "brand_color",
      type: "varchar",
      length: 20,
      nullable: true,
    },
    updatedBy: {
      name: "updated_by",
      type: "uuid",
      nullable: true,
    },
    updatedAt: {
      name: "updated_at",
      type: "timestamptz",
      updateDate: true,
    },
  },
  relations: {
    project: {
      type: "one-to-one",
      target: "Project",
      joinColumn: { name: "project_id" },
      onDelete: "CASCADE",
    },
  },
});

export { LiveChatSettings };
