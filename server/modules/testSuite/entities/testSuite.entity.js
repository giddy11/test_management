// modules/testSuite/entities/testSuite.entity.js
const { EntitySchema } = require("typeorm");

const TestSuite = new EntitySchema({
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

module.exports = { TestSuite };
