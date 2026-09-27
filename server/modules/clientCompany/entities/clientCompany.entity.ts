// modules/clientCompany/entities/clientCompany.entity.ts
// An external company that uses one of the org's products (projects). Each
// client company has its own public feedback form token and its own IT
// supporter accounts (users.client_company_id) who triage end-user feedback
// before it reaches the product owner.
import { EntitySchema } from "typeorm";

export interface ClientCompany {
  id: string;
  projectId: string;
  name: string;
  contactEmail: string | null;
  // Permanent once minted — feedbackEnabled decides whether the form
  // actually resolves (see ClientCompanyService.setFeedbackLink).
  feedbackToken: string | null;
  feedbackEnabled: boolean;
  // Opt-in, set by the company's own IT support lead: route each incoming
  // ticket to their least-busy supporter instead of alerting the whole queue.
  autoAssignEnabled: boolean;
  createdAt: Date;
  deletedAt: Date | null;
  project?: unknown;
}

const ClientCompany = new EntitySchema<ClientCompany>({
  name: "ClientCompany",
  tableName: "client_companies",
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
    name: {
      type: "varchar",
      length: 200,
    },
    contactEmail: {
      name: "contact_email",
      type: "varchar",
      length: 255,
      nullable: true,
    },
    feedbackToken: {
      name: "feedback_token",
      type: "uuid",
      nullable: true,
    },
    feedbackEnabled: {
      name: "feedback_enabled",
      type: "boolean",
      default: false,
    },
    autoAssignEnabled: {
      name: "auto_assign_enabled",
      type: "boolean",
      default: false,
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
  },
  indices: [
    { name: "idx_client_companies_project", columns: ["projectId"] },
    { name: "idx_client_companies_feedback_token", columns: ["feedbackToken"] },
  ],
});

export { ClientCompany };
