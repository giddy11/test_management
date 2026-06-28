// modules/testCase/entities/testCase.entity.js
const { EntitySchema } = require("typeorm");
const {
  enums,
  TestCasePriority,
  TestCaseStatus,
} = require("../../../config/constants");

const TestCase = new EntitySchema({
  name: "TestCase",
  tableName: "test_cases",
  columns: {
    id: {
      type: "uuid",
      primary: true,
      generated: "uuid",
    },
    title: {
      type: "varchar",
      length: 200,
    },
    description: {
      type: "text",
      nullable: true,
    },
    // Ordered execution steps stored as a PG text[] array.
    steps: {
      type: "text",
      array: true,
      default: () => "'{}'",
    },
    expectedResult: {
      name: "expected_result",
      type: "text",
    },
    priority: {
      type: "enum",
      enum: enums.testCasePriority,
      default: TestCasePriority.MEDIUM,
    },
    status: {
      type: "enum",
      enum: enums.testCaseStatus,
      default: TestCaseStatus.DRAFT,
    },
    suiteId: {
      name: "suite_id",
      type: "uuid",
    },
    assignedToId: {
      name: "assigned_to_id",
      type: "uuid",
      nullable: true,
    },
    tags: {
      type: "text",
      array: true,
      nullable: true,
    },
    createdById: {
      name: "created_by_id",
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
    suite: {
      type: "many-to-one",
      target: "TestSuite",
      joinColumn: { name: "suite_id" },
      onDelete: "CASCADE",
    },
    assignedTo: {
      type: "many-to-one",
      target: "User",
      joinColumn: { name: "assigned_to_id" },
      nullable: true,
    },
  },
  indices: [
    { name: "idx_test_cases_suite_id", columns: ["suiteId"] },
    { name: "idx_test_cases_assigned_to_id", columns: ["assignedToId"] },
    { name: "idx_test_cases_suite_created", columns: ["suiteId", "createdAt"] },
  ],
});

module.exports = { TestCase };
