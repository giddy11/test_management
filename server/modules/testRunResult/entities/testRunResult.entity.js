// modules/testRunResult/entities/testRunResult.entity.js
const { EntitySchema } = require("typeorm");
const { enums } = require("../../../config/constants");

const TestRunResult = new EntitySchema({
  name: "TestRunResult",
  tableName: "test_run_results",
  columns: {
    id: {
      type: "uuid",
      primary: true,
      generated: "uuid",
    },
    runId: {
      name: "run_id",
      type: "uuid",
    },
    testCaseId: {
      name: "test_case_id",
      type: "uuid",
    },
    status: {
      type: "enum",
      enum: enums.resultStatus,
      nullable: true,
    },
    actualResult: {
      name: "actual_result",
      type: "text",
      nullable: true,
    },
    notes: {
      type: "text",
      nullable: true,
    },
    executedById: {
      name: "executed_by_id",
      type: "uuid",
      nullable: true,
    },
    executedAt: {
      name: "executed_at",
      type: "timestamptz",
      nullable: true,
    },
  },
  relations: {
    run: {
      type: "many-to-one",
      target: "TestRun",
      joinColumn: { name: "run_id" },
      onDelete: "CASCADE",
    },
    testCase: {
      type: "many-to-one",
      target: "TestCase",
      joinColumn: { name: "test_case_id" },
    },
    executedBy: {
      type: "many-to-one",
      target: "User",
      joinColumn: { name: "executed_by_id" },
      nullable: true,
    },
  },
  indices: [
    { name: "idx_run_results_run_id", columns: ["runId"] },
    { name: "idx_run_results_test_case_id", columns: ["testCaseId"] },
    { name: "idx_run_results_executed_by_id", columns: ["executedById"] },
  ],
});

module.exports = { TestRunResult };
