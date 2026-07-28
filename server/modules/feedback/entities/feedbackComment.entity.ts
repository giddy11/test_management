// modules/feedback/entities/feedbackComment.entity.ts
// A back-and-forth message on a ticket — either an internal staff member
// (product-team admin/assignee, or an IT supporter on their own company's
// queue) or the ticket's submitter (no account — see feedbackComment.service.ts
// for how they prove ownership). Distinct from feedback.admin_response /
// support_response, which only ever hold the latest note tied to a status
// change; this is a persistent, ordered thread.
import { EntitySchema } from "typeorm";

export interface FeedbackComment {
  id: string;
  feedbackId: string;
  // "staff" | "submitter" — who wrote it. Not a UserRole: the submitter has
  // no account at all, so this can't be derived from authorId alone.
  authorType: string;
  // Set for staff comments (the posting User); null for the submitter, who
  // has no user row.
  authorId: string | null;
  // Denormalized display name — the staff member's name, or the ticket's
  // submitterName — so rendering the thread never needs a join back to users.
  authorName: string;
  body: string;
  createdAt: Date;
  feedback?: unknown;
  attachments?: { id: string; fileName: string; fileUrl: string; mimeType: string; fileSizeBytes: number }[];
}

const FeedbackComment = new EntitySchema<FeedbackComment>({
  name: "FeedbackComment",
  tableName: "feedback_comments",
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
    authorType: {
      name: "author_type",
      type: "varchar",
      length: 20,
    },
    authorId: {
      name: "author_id",
      type: "uuid",
      nullable: true,
    },
    authorName: {
      name: "author_name",
      type: "varchar",
      length: 120,
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
  relations: {
    feedback: {
      type: "many-to-one",
      target: "Feedback",
      joinColumn: { name: "feedback_id" },
      onDelete: "CASCADE",
    },
    attachments: {
      type: "one-to-many",
      target: "FeedbackCommentAttachment",
      inverseSide: "comment",
    },
  },
  indices: [{ name: "idx_feedback_comments_feedback", columns: ["feedbackId"] }],
});

export { FeedbackComment };
