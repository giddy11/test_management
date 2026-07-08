// modules/testSuite/entities/testSuite.entity.ts
import { EntitySchema } from "typeorm";

export interface TestSuite {
  id: string;
  name: string;
  description: string | null;
  projectId: string;
  createdAt: Date;
  deletedAt: Date | null;
  // Typed loosely until the Project entity is converted to TS.
  project?: unknown;
}

const TestSuite = new EntitySchema<TestSuite>({
  name: "TestSuite",
  tableName: "test_suites",
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
    projectId: {
      name: "project_id",
      type: "uuid",
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
    { name: "idx_test_suites_project_id", columns: ["projectId"] },
    { name: "idx_test_suites_project_created", columns: ["projectId", "createdAt"] },
  ],
});

export { TestSuite };
