module.exports = class AddExternalIdToTestCases1782800000000 {
  async up(q) {
    await q.query(`ALTER TABLE "test_cases" ADD COLUMN IF NOT EXISTS "external_id" VARCHAR(255) NULL`);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "IDX_test_cases_suite_external_id"
       ON "test_cases"("suite_id", "external_id")
       WHERE "deleted_at" IS NULL AND "external_id" IS NOT NULL`
    );
  }

  async down(q) {
    await q.query(`DROP INDEX IF EXISTS "IDX_test_cases_suite_external_id"`);
    await q.query(`ALTER TABLE "test_cases" DROP COLUMN IF EXISTS "external_id"`);
  }
};
