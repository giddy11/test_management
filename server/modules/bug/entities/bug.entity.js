// modules/bug/entities/bug.entity.js
// Project-scoped — access is governed by ProjectService.assertAccess via the
// project relation, same as FeatureRequest/TestSuite.
const { EntitySchema } = require("typeorm");
const { enums, BugSeverity, BugPriority, BugStatus } = require("../../../config/constants");

const Bug = new EntitySchema({
  name: "Bug",
  tableName: "bugs",
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
    // Human-readable sequential id shown as "BF-014" (see shared/utils/referenceCode)
    // instead of the raw uuid, same idea as Feedback.ticketNumber.
    bugNumber: {
      name: "bug_number",
      type: "int",
      generated: "increment",
    },
    title: {
      type: "varchar",
      length: 200,
    },
    description: {
      type: "text",
    },
    // Ordered repro steps, same array-column pattern as TestCase.steps.
    stepsToReproduce: {
      name: "steps_to_reproduce",
      type: "text",
      array: true,
      nullable: true,
    },
    expectedBehavior: {
      name: "expected_behavior",
      type: "text",
      nullable: true,
    },
    actualBehavior: {
      name: "actual_behavior",
      type: "text",
      nullable: true,
    },
    environment: {
      type: "varchar",
      length: 255,
      nullable: true,
    },
    severity: {
      type: "enum",
      enum: enums.bugSeverity,
      default: BugSeverity.MINOR,
    },
    priority: {
      type: "enum",
      enum: enums.bugPriority,
      default: BugPriority.MEDIUM,
    },
    status: {
      type: "enum",
      enum: enums.bugStatus,
      default: BugStatus.OPEN,
    },
    testCaseId: {
      name: "test_case_id",
      type: "uuid",
      nullable: true,
    },
    testRunId: {
      name: "test_run_id",
      type: "uuid",
      nullable: true,
    },
    reportedById: {
      name: "reported_by_id",
      type: "uuid",
      nullable: true,
    },
    assignedToId: {
      name: "assigned_to_id",
      type: "uuid",
      nullable: true,
    },
    resolvedAt: {
      name: "resolved_at",
      type: "timestamptz",
      nullable: true,
    },
    closedAt: {
      name: "closed_at",
      type: "timestamptz",
      nullable: true,
    },
    statusUpdatedAt: {
      name: "status_updated_at",
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
    testCase: {
      type: "many-to-one",
      target: "TestCase",
      joinColumn: { name: "test_case_id" },
      nullable: true,
      onDelete: "SET NULL",
    },
    testRun: {
      type: "many-to-one",
      target: "TestRun",
      joinColumn: { name: "test_run_id" },
      nullable: true,
      onDelete: "SET NULL",
    },
    reportedBy: {
      type: "many-to-one",
      target: "User",
      joinColumn: { name: "reported_by_id" },
      nullable: true,
      onDelete: "SET NULL",
    },
    assignedTo: {
      type: "many-to-one",
      target: "User",
      joinColumn: { name: "assigned_to_id" },
      nullable: true,
      onDelete: "SET NULL",
    },
  },
  indices: [
    { name: "idx_bugs_project_status_created", columns: ["projectId", "status", "createdAt"] },
    { name: "idx_bugs_assigned_to", columns: ["assignedToId"] },
    { name: "idx_bugs_reported_by", columns: ["reportedById"] },
    { name: "idx_bugs_test_case", columns: ["testCaseId"] },
    { name: "idx_bugs_test_run", columns: ["testRunId"] },
    { name: "idx_bugs_bug_number", columns: ["bugNumber"], unique: true },
  ],
});

module.exports = { Bug };
