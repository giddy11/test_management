// modules/feedback/entities/feedback.entity.ts
// External feedback submitted by non-TestMate users via a project's public
// form (projects.feedback_token). Tracked through a support-style lifecycle;
// the submitter is emailed at every stage transition.
import { EntitySchema } from "typeorm";

const { FeedbackStatus } = require("../../../config/constants");

export interface Feedback {
  id: string;
  // Human-readable sequential id shown everywhere instead of the uuid (UI,
  // emails). Global across all projects — assigned by a DB sequence, never
  // reused.
  ticketNumber: number;
  projectId: string;
  // Set when submitted through a client company's form token. While
  // supportStatus !== "escalated" the item is visible ONLY to that company's
  // IT supporters — never to the product owner's triage.
  clientCompanyId: string | null;
  // IT-tier state (SupportStatus: open/resolved/escalated) — null on direct
  // submissions. Orthogonal to `status`, which is the product owner's lifecycle.
  supportStatus: string | null;
  // The IT supporter's note — local-resolution message to the end user, or
  // escalation context for the product team. Distinct from adminResponse.
  supportResponse: string | null;
  supportResolvedAt: Date | null;
  escalatedAt: Date | null;
  // Supporter who escalated — post-escalation lifecycle emails go to them,
  // not the original submitter.
  escalatedById: string | null;
  // Set by an IT support lead to route this item to a specific supporter
  // within their company. Independent of supportStatus — a lead can assign
  // an item the moment it lands, before any triage stage is reached.
  assignedSupporterId: string | null;
  // Set by IT support when they escalate — tells the product team how urgent
  // it is. Null until escalated.
  severity: string | null; // FeedbackSeverity
  // Set when IT support tells the original end user an escalated item was
  // fixed — the true submitter never sees product-team stage emails, so this
  // is a deliberate relay step, not automatic. Null until they do.
  submitterNotifiedAt: Date | null;
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
  // The submitter's one-time satisfaction rating (1-5), given once the ticket
  // reads as resolved to them (see SubmitterTicketStatus) — null until rated.
  rating: number | null;
  // Denormalized from feedback_comments — comments live in their own table
  // (see feedbackComment.entity.ts), this just powers a "3 comments" badge
  // without a COUNT() join on every list fetch.
  commentCount: number;
  createdAt: Date;
  deletedAt: Date | null;
  project?: unknown;
  clientCompany?: { id: string; name: string; feedbackToken?: string | null } | null;
  escalatedBy?: { id: string; firstName: string; lastName: string | null; email: string } | null;
  assignedSupporter?: { id: string; firstName: string; lastName: string | null; email: string } | null;
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
    ticketNumber: {
      name: "ticket_number",
      type: "int",
      generated: "increment",
    },
    projectId: {
      name: "project_id",
      type: "uuid",
    },
    clientCompanyId: {
      name: "client_company_id",
      type: "uuid",
      nullable: true,
    },
    supportStatus: {
      name: "support_status",
      type: "varchar",
      // 30, not 20 — "awaiting_confirmation" (21 chars) needs the extra room;
      // see migration WidenFeedbackSupportStatus.
      length: 30,
      nullable: true,
    },
    supportResponse: {
      name: "support_response",
      type: "text",
      nullable: true,
    },
    supportResolvedAt: {
      name: "support_resolved_at",
      type: "timestamptz",
      nullable: true,
    },
    escalatedAt: {
      name: "escalated_at",
      type: "timestamptz",
      nullable: true,
    },
    escalatedById: {
      name: "escalated_by_id",
      type: "uuid",
      nullable: true,
    },
    assignedSupporterId: {
      name: "assigned_supporter_id",
      type: "uuid",
      nullable: true,
    },
    severity: {
      type: "varchar",
      length: 20,
      nullable: true,
    },
    submitterNotifiedAt: {
      name: "submitter_notified_at",
      type: "timestamptz",
      nullable: true,
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
    rating: {
      type: "smallint",
      nullable: true,
    },
    commentCount: {
      name: "comment_count",
      type: "int",
      default: 0,
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
    clientCompany: {
      type: "many-to-one",
      target: "ClientCompany",
      joinColumn: { name: "client_company_id" },
      onDelete: "SET NULL",
      nullable: true,
    },
    escalatedBy: {
      type: "many-to-one",
      target: "User",
      joinColumn: { name: "escalated_by_id" },
      onDelete: "SET NULL",
      nullable: true,
    },
    assignedSupporter: {
      type: "many-to-one",
      target: "User",
      joinColumn: { name: "assigned_supporter_id" },
      onDelete: "SET NULL",
      nullable: true,
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
    // The IT support queue: a company's items filtered by support state.
    {
      name: "idx_feedback_company_support_created",
      columns: ["clientCompanyId", "supportStatus", "createdAt"],
    },
    // "Assigned to me" / reassignment filters within a company's queue.
    { name: "idx_feedback_assigned_supporter", columns: ["assignedSupporterId"] },
    { name: "idx_feedback_ticket_number", columns: ["ticketNumber"], unique: true },
  ],
});

export { Feedback };
