// Migration: a running notes thread on a test case, separate from the
// per-execution notes stored on test_run_results.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddTestCaseNotes1783260000000 implements MigrationInterface {
  name = "AddTestCaseNotes1783260000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "test_case_notes" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "test_case_id" uuid NOT NULL REFERENCES "test_cases"("id") ON DELETE CASCADE,
        "body" text NOT NULL,
        "author_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_test_case_notes_test_case_id" ON "test_case_notes" ("test_case_id")`
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_test_case_notes_author_id" ON "test_case_notes" ("author_id")`
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "test_case_notes"`);
  }
}
