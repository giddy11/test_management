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
  ],
});

export { Project };
