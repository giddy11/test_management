// Migration: adds nullable deadline date column to test_cases.
module.exports = class AddDeadlineToTestCases1782790000000 {
  name = "AddDeadlineToTestCases1782790000000";

  async up(q) {
    await q.query(`ALTER TABLE "test_cases" ADD COLUMN IF NOT EXISTS "deadline" date`);
  }

  async down(q) {
    await q.query(`ALTER TABLE "test_cases" DROP COLUMN IF EXISTS "deadline"`);
  }
};
