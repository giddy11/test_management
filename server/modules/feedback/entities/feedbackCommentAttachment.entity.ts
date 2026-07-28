// modules/feedback/entities/feedbackCommentAttachment.entity.ts
// A file attached to a ticket comment — a screenshot (Cloudinary "image")
// or a document like a PDF/Word/Excel file (Cloudinary "raw", see
// StorageService.uploadRaw). Same shape as bugAttachment/featureRequestAttachment
// (fileName/mimeType/fileSizeBytes), unlike feedback_attachments (which only
// ever held screenshots on the original submission).
import { EntitySchema } from "typeorm";

export interface FeedbackCommentAttachment {
  id: string;
  commentId: string;
  fileName: string;
  fileUrl: string;
  filePublicId: string;
  mimeType: string;
  fileSizeBytes: number;
  createdAt: Date;
  comment?: unknown;
}

const FeedbackCommentAttachment = new EntitySchema<FeedbackCommentAttachment>({
  name: "FeedbackCommentAttachment",
  tableName: "feedback_comment_attachments",
  columns: {
    id: {
      type: "uuid",
      primary: true,
      generated: "uuid",
    },
    commentId: {
      name: "comment_id",
      type: "uuid",
    },
    fileName: {
      name: "file_name",
      type: "varchar",
      length: 255,
    },
    fileUrl: {
      name: "file_url",
      type: "text",
    },
    // Required for deletion and Cloudinary transformations.
    filePublicId: {
      name: "file_public_id",
      type: "varchar",
      length: 255,
    },
    mimeType: {
      name: "mime_type",
      type: "varchar",
      length: 100,
    },
    fileSizeBytes: {
      name: "file_size_bytes",
      type: "int",
    },
    createdAt: {
      name: "created_at",
      type: "timestamptz",
      createDate: true,
    },
  },
  relations: {
    comment: {
      type: "many-to-one",
      target: "FeedbackComment",
      joinColumn: { name: "comment_id" },
      onDelete: "CASCADE",
    },
  },
  indices: [{ name: "idx_feedback_comment_attachments_comment", columns: ["commentId"] }],
});

export { FeedbackCommentAttachment };
