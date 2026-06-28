// modules/testCase/entities/testCaseAttachment.entity.js
// Metadata for images/screenshots linked to a test case (and optionally a run result).
const { EntitySchema } = require("typeorm");

const TestCaseAttachment = new EntitySchema({
  name: "TestCaseAttachment",
  tableName: "test_case_attachments",
  columns: {
    id: {
      type: "uuid",
      primary: true,
      generated: "uuid",
    },
    testCaseId: {
      name: "test_case_id",
      type: "uuid",
    },
    runResultId: {
      name: "run_result_id",
      type: "uuid",
      nullable: true,
    },
    fileName: {
      name: "file_name",
      type: "varchar",
      length: 255,
    },
    fileUrl: {
      name: "file_url",
      type: "text",
    },
    // Cloudinary public id — required to delete/transform the asset later.
    filePublicId: {
      name: "file_public_id",
      type: "varchar",
      length: 255,
      nullable: true,
    },
    mimeType: {
      name: "mime_type",
      type: "varchar",
      length: 100,
    },
    fileSizeBytes: {
      name: "file_size_bytes",
      type: "integer",
    },
    uploadedById: {
      name: "uploaded_by_id",
      type: "uuid",
      nullable: true,
    },
    createdAt: {
      name: "created_at",
      type: "timestamptz",
      createDate: true,
    },
  },
  relations: {
    testCase: {
      type: "many-to-one",
      target: "TestCase",
      joinColumn: { name: "test_case_id" },
      onDelete: "CASCADE",
    },
    runResult: {
      type: "many-to-one",
      target: "TestRunResult",
      joinColumn: { name: "run_result_id" },
      nullable: true,
      onDelete: "SET NULL",
    },
  },
  indices: [
    { name: "idx_attachments_test_case_id", columns: ["testCaseId"] },
    { name: "idx_attachments_run_result_id", columns: ["runResultId"] },
    { name: "idx_attachments_uploaded_by_id", columns: ["uploadedById"] },
  ],
});

module.exports = { TestCaseAttachment };
