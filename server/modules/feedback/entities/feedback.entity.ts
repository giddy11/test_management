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
  status: string; // FeedbackStatus
  assignedToId: string | null;
  adminResponse: string | null;
  statusUpdatedAt: Date | null;
  createdAt: Date;
  deletedAt: Date | null;
  project?: unknown;
  assignedTo?: unknown;
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
    status: {
      type: "varchar",
      length: 30,
      default: FeedbackStatus.LOGGED,
    },
    assignedToId: {
      name: "assigned_to_id",
      type: "uuid",
      nullable: true,
    },
    adminResponse: {
      name: "admin_response",
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
    assignedTo: {
      type: "many-to-one",
      target: "User",
      joinColumn: { name: "assigned_to_id" },
      nullable: true,
      onDelete: "SET NULL",
    },
    attachments: {
      type: "one-to-many",
      target: "FeedbackAttachment",
      inverseSide: "feedback",
    },
  },
  indices: [
    { name: "idx_feedback_project_status_created", columns: ["projectId", "status", "createdAt"] },
    { name: "idx_feedback_assigned_to", columns: ["assignedToId"] },
  ],
});

export { Feedback };
