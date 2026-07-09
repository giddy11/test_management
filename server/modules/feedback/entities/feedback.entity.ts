// modules/feedback/entities/feedback.entity.ts
// External feedback submitted by non-TestMate users via a project's public
// form (projects.feedback_token). Tracked through a support-style lifecycle;
// the submitter is emailed at every stage transition.
import { EntitySchema } from "typeorm";

const { FeedbackStatus } = require("../../../config/constants");

export interface Feedback {
  id: string;
  projectId: string;
  type: string; // FeedbackType
  title: string;
  description: string;
  // Optional module/suite of the project the feedback relates to (suite name
  // picked from a dropdown on the public form).
  suiteName: string | null;
  submitterName: string;
  submitterEmail: string;
  // Optional, E.164 format (e.g. "+2348012345678") — collected via the
  // public form's international phone input.
  submitterPhone: string | null;
  status: string; // FeedbackStatus
  adminResponse: string | null;
  // Set when the submitter rejects a resolution via the confirmation link
  // (optional — why it isn't fixed). Cleared once the item is closed again.
  reopenReason: string | null;
  statusUpdatedAt: Date | null;
  createdAt: Date;
  deletedAt: Date | null;
  project?: unknown;
  // A feedback item can be assigned to several project members at once.
  assignees?: { id: string; firstName: string; lastName: string | null; email: string }[];
  attachments?: { id: string; url: string; publicId: string }[];
}

const Feedback = new EntitySchema<Feedback>({
  name: "Feedback",
  tableName: "feedback",
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
    type: {
      type: "varchar",
      length: 30,
    },
    title: {
      type: "varchar",
      length: 200,
    },
    description: {
      type: "text",
    },
    suiteName: {
      name: "suite_name",
      type: "varchar",
      length: 200,
      nullable: true,
    },
    submitterName: {
      name: "submitter_name",
      type: "varchar",
      length: 120,
    },
    submitterEmail: {
      name: "submitter_email",
      type: "varchar",
      length: 255,
    },
    submitterPhone: {
      name: "submitter_phone",
      type: "varchar",
      length: 30,
      nullable: true,
    },
    status: {
      type: "varchar",
      length: 30,
      default: FeedbackStatus.LOGGED,
    },
    adminResponse: {
      name: "admin_response",
      type: "text",
      nullable: true,
    },
    reopenReason: {
      name: "reopen_reason",
      type: "text",
      nullable: true,
    },
    statusUpdatedAt: {
      name: "status_updated_at",
      type: "timestamptz",
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
  relations: {
    project: {
      type: "many-to-one",
      target: "Project",
      joinColumn: { name: "project_id" },
      onDelete: "CASCADE",
    },
    // A feedback item can be assigned to several project members at once.
    assignees: {
      type: "many-to-many",
      target: "User",
      joinTable: {
        name: "feedback_assignees",
        joinColumn: { name: "feedback_id", referencedColumnName: "id" },
        inverseJoinColumn: { name: "user_id", referencedColumnName: "id" },
      },
    },
    attachments: {
      type: "one-to-many",
      target: "FeedbackAttachment",
      inverseSide: "feedback",
    },
  },
  indices: [
    { name: "idx_feedback_project_status_created", columns: ["projectId", "status", "createdAt"] },
  ],
});

export { Feedback };
