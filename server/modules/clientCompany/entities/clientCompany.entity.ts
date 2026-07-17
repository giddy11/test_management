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
  // Token for this company's public feedback form — null = form disabled.
  feedbackToken: string | null;
  // Hashed bearer secret for this company's partner integration API
  // (POST/GET /api/v1/integrations/tickets) — a real credential, unlike
  // feedbackToken, so only its hash is stored and it's never returned after
  // creation. Tickets created with it land in THIS company's IT queue, same
  // as a form submission — see FeedbackService.createIntegrationTicket.
  integrationApiKeyHash: string | null;
  // Last 4 chars of the raw key, safe to display (e.g. "Key ending in •••1234").
  integrationApiKeyLastFour: string | null;
  integrationApiKeyCreatedAt: Date | null;
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
    integrationApiKeyHash: {
      name: "integration_api_key_hash",
      type: "varchar",
      length: 255,
      nullable: true,
    },
    integrationApiKeyLastFour: {
      name: "integration_api_key_last_four",
      type: "varchar",
      length: 4,
      nullable: true,
    },
    integrationApiKeyCreatedAt: {
      name: "integration_api_key_created_at",
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
  },
  indices: [
    { name: "idx_client_companies_project", columns: ["projectId"] },
    { name: "idx_client_companies_feedback_token", columns: ["feedbackToken"] },
    {
      name: "idx_client_companies_integration_api_key_hash",
      columns: ["integrationApiKeyHash"],
      unique: true,
      where: "integration_api_key_hash IS NOT NULL",
    },
  ],
});

export { ClientCompany };
