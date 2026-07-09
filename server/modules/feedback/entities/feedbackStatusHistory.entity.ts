// modules/feedback/entities/feedbackStatusHistory.entity.ts
// One row per lifecycle stage a feedback item has entered — the timestamp is
// used to compute how long it spent in each stage (a timeline in the UI).
import { EntitySchema } from "typeorm";

export interface FeedbackStatusHistory {
  id: string;
  feedbackId: string;
  status: string; // FeedbackStatus
  enteredAt: Date;
  feedback?: unknown;
}

const FeedbackStatusHistory = new EntitySchema<FeedbackStatusHistory>({
  name: "FeedbackStatusHistory",
  tableName: "feedback_status_history",
  columns: {
    id: {
      type: "uuid",
      primary: true,
      generated: "uuid",
    },
    feedbackId: {
      name: "feedback_id",
      type: "uuid",
    },
    status: {
      type: "varchar",
      length: 30,
    },
    // Not a `createDate` column — callers set this explicitly (e.g. the initial
    // "logged" entry is backdated to the feedback's own createdAt).
    enteredAt: {
      name: "entered_at",
      type: "timestamptz",
      default: () => "CURRENT_TIMESTAMP",
    },
  },
  relations: {
    feedback: {
      type: "many-to-one",
      target: "Feedback",
      joinColumn: { name: "feedback_id" },
      onDelete: "CASCADE",
    },
  },
  indices: [{ name: "idx_feedback_status_history_feedback", columns: ["feedbackId", "enteredAt"] }],
});

export { FeedbackStatusHistory };
