// modules/feedback/entities/feedbackAttachment.entity.ts
// Optional screenshots uploaded with an external feedback submission —
// same Cloudinary pattern as TestCaseAttachment / BugAttachment.
import { EntitySchema } from "typeorm";

export interface FeedbackAttachment {
  id: string;
  feedbackId: string;
  url: string;
  publicId: string;
  createdAt: Date;
  feedback?: unknown;
}

const FeedbackAttachment = new EntitySchema<FeedbackAttachment>({
  name: "FeedbackAttachment",
  tableName: "feedback_attachments",
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
    url: {
      type: "varchar",
      length: 500,
    },
    // Required for deletion and Cloudinary transformations.
    publicId: {
      name: "public_id",
      type: "varchar",
      length: 255,
    },
    createdAt: {
      name: "created_at",
      type: "timestamptz",
      createDate: true,
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
  indices: [{ name: "idx_feedback_attachments_feedback", columns: ["feedbackId"] }],
});

export { FeedbackAttachment };
