// modules/project/entities/project.entity.ts
import { EntitySchema } from "typeorm";
import type { ProjectMember } from "./projectMember.entity";

export interface Project {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  organizationId: string | null;
  // When set, the public feedback form at /feedback/<token> is enabled.
  feedbackToken: string | null;
  // SHA-256 hash of the partner integration API key — never the raw value.
  // Null = no integration key issued (or revoked).
  integrationApiKeyHash: string | null;
  // Last 4 chars of the raw key, safe to display (e.g. "Key ending in •••1234").
  integrationApiKeyLastFour: string | null;
  integrationApiKeyCreatedAt: Date | null;
  createdAt: Date;
  deletedAt: Date | null;
  owner?: unknown;
  memberships?: ProjectMember[];
  // Attached by ProjectRepository.fetchPaginated — not a column.
  suiteCount?: number;
}

const Project = new EntitySchema<Project>({
  name: "Project",
  tableName: "projects",
  columns: {
    id: {
      type: "uuid",
      primary: true,
      generated: "uuid",
    },
    name: {
      type: "varchar",
      length: 200,
    },
    description: {
      type: "text",
      nullable: true,
    },
    ownerId: {
      name: "owner_id",
      type: "uuid",
    },
    // Company that owns this project — all its members share access.
    organizationId: {
      name: "organization_id",
      type: "uuid",
      nullable: true,
    },
    // Secret token enabling the public feedback form; null = disabled.
    feedbackToken: {
      name: "feedback_token",
      type: "uuid",
      nullable: true,
    },
    // Hashed bearer secret for the partner integration API (POST/GET
    // /api/v1/integrations/tickets) — a real credential, unlike feedbackToken,
    // so only its hash is stored and it's never returned after creation.
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
    owner: {
      type: "many-to-one",
      target: "User",
      joinColumn: { name: "owner_id" },
    },
    // Assigned users with a per-project role (member | team_lead).
    memberships: {
      type: "one-to-many",
      target: "ProjectMember",
      inverseSide: "project",
    },
  },
  indices: [
    { name: "idx_projects_name", columns: ["name"] },
    { name: "idx_projects_owner_id", columns: ["ownerId"] },
    { name: "idx_projects_org_created", columns: ["organizationId", "createdAt"] },
    {
      name: "idx_projects_integration_api_key_hash",
      columns: ["integrationApiKeyHash"],
      unique: true,
      where: "integration_api_key_hash IS NOT NULL",
    },
  ],
});

export { Project };
