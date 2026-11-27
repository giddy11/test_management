// modules/reviewPrompt/entities/reviewPrompt.entity.ts
// The review reminder: a pop-up asking whoever reported a bug or feature request
// to confirm it once it's marked ready, and reminding assignees of their open
// work. Two tables:
//   - review_prompt_settings: one row (id "global"), the platform owner's
//     on/off switch and interval. No row means the defaults.
//   - review_prompt_states: when each person was last shown the pop-up.
import { EntitySchema } from "typeorm";

export interface ReviewPromptSettings {
  id: string;
  enabled: boolean;
  intervalHours: number;
  updatedBy: string | null;
  updatedAt: Date;
}

export interface ReviewPromptState {
  userId: string;
  lastPromptedAt: Date;
}

export const ReviewPromptSettings = new EntitySchema<ReviewPromptSettings>({
  name: "ReviewPromptSettings",
  tableName: "review_prompt_settings",
  columns: {
    id: { type: "varchar", length: 20, primary: true },
    enabled: { type: "boolean", default: true },
    intervalHours: { name: "interval_hours", type: "integer", default: 2 },
    updatedBy: { name: "updated_by", type: "uuid", nullable: true },
    updatedAt: { name: "updated_at", type: "timestamptz", updateDate: true },
  },
});

export const ReviewPromptState = new EntitySchema<ReviewPromptState>({
  name: "ReviewPromptState",
  tableName: "review_prompt_states",
  columns: {
    userId: { name: "user_id", type: "uuid", primary: true },
    lastPromptedAt: { name: "last_prompted_at", type: "timestamptz" },
  },
});
