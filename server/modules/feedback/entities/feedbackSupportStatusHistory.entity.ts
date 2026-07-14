// modules/feedback/entities/feedbackSupportStatusHistory.entity.ts
// One row per IT-tier stage a client-company feedback item has entered
// (SupportStatus: logged → acknowledged → investigating → resolved|escalated).
// Kept separate from feedback_status_history: that table is the PRODUCT team's
// timeline (which starts at escalation) and shares stage names like "logged".
import { EntitySchema } from "typeorm";

export interface FeedbackSupportStatusHistory {
  id: string;
  feedbackId: string;
  status: string; // SupportStatus
  enteredAt: Date;
  feedback?: unknown;
}

const FeedbackSupportStatusHistory = new EntitySchema<FeedbackSupportStatusHistory>({
  name: "FeedbackSupportStatusHistory",
  tableName: "feedback_support_status_history",
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
    // Not a `createDate` column — callers set this explicitly (the initial
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
  indices: [
    {
      name: "idx_feedback_support_status_history_feedback",
      columns: ["feedbackId", "enteredAt"],
    },
  ],
});

export { FeedbackSupportStatusHistory };
