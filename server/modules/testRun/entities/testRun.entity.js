// modules/testRun/entities/testRun.entity.js
const { EntitySchema } = require("typeorm");
const { enums, RunStatus } = require("../../../config/constants");

const TestRun = new EntitySchema({
  name: "TestRun",
  tableName: "test_runs",
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
    projectId: {
      name: "project_id",
      type: "uuid",
    },
    suiteId: {
      name: "suite_id",
      type: "uuid",
    },
    status: {
      type: "enum",
      enum: enums.runStatus,
      default: RunStatus.IN_PROGRESS,
    },
    createdById: {
      name: "created_by_id",
      type: "uuid",
    },
    createdAt: {
      name: "created_at",
      type: "timestamptz",
      createDate: true,
    },
  },
  relations: {
    project: {
      type: "many-to-one",
      target: "Project",
      joinColumn: { name: "project_id" },
      onDelete: "CASCADE",
    },
    suite: {
      type: "many-to-one",
      target: "TestSuite",
      joinColumn: { name: "suite_id" },
    },
    createdBy: {
      type: "many-to-one",
      target: "User",
      joinColumn: { name: "created_by_id" },
    },
  },
  indices: [
    { name: "idx_test_runs_project_id", columns: ["projectId"] },
    { name: "idx_test_runs_suite_id", columns: ["suiteId"] },
    { name: "idx_test_runs_created_by_id", columns: ["createdById"] },
    { name: "idx_test_runs_project_created", columns: ["projectId", "createdAt"] },
  ],
});

module.exports = { TestRun };
