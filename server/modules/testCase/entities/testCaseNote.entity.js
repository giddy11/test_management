// modules/testCase/entities/testCaseNote.entity.js
// Free-form notes the team leaves on a test case — a running thread, separate
// from the per-run notes on test_run_results (which belong to one execution).
const { EntitySchema } = require("typeorm");

const TestCaseNote = new EntitySchema({
  name: "TestCaseNote",
  tableName: "test_case_notes",
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
    body: {
      type: "text",
    },
    // Null once the author's account is deleted — the note itself survives.
    authorId: {
      name: "author_id",
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
    author: {
      type: "many-to-one",
      target: "User",
      joinColumn: { name: "author_id" },
      nullable: true,
      onDelete: "SET NULL",
    },
  },
  indices: [
    { name: "idx_test_case_notes_test_case_id", columns: ["testCaseId"] },
    { name: "idx_test_case_notes_author_id", columns: ["authorId"] },
  ],
});

module.exports = { TestCaseNote };
