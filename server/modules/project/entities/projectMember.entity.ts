// modules/project/entities/projectMember.entity.ts
// Explicit join row between a project and a user, carrying the user's role
// inside that project. Replaces the previous implicit many-to-many join table
// (same physical table: project_members).
import { EntitySchema } from "typeorm";

export interface ProjectMember {
  projectId: string;
  userId: string;
  role: string; // ProjectMemberRole: "member" | "team_lead"
  project?: unknown;
  user?: unknown; // hydrated User when loaded with the relation
}

const ProjectMember = new EntitySchema<ProjectMember>({
  name: "ProjectMember",
  tableName: "project_members",
  columns: {
    projectId: {
      name: "project_id",
      type: "uuid",
      primary: true,
    },
    userId: {
      name: "user_id",
      type: "uuid",
      primary: true,
    },
    role: {
      type: "varchar",
      length: 20,
      default: "member",
    },
  },
  relations: {
    project: {
      type: "many-to-one",
      target: "Project",
      joinColumn: { name: "project_id" },
      onDelete: "CASCADE",
    },
    user: {
      type: "many-to-one",
      target: "User",
      joinColumn: { name: "user_id" },
      onDelete: "CASCADE",
    },
  },
  indices: [{ name: "idx_pm_user", columns: ["userId"] }],
});

export { ProjectMember };
