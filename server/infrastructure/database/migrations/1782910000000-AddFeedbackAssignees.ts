// Migration: multi-user feedback assignment. Replaces the single
// feedback.assigned_to_id column with a feedback_assignees join table
// (feedback ↔ users, many-to-many), mirroring test_case_assignees.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddFeedbackAssignees1782910000000 implements MigrationInterface {
  name = "AddFeedbackAssignees1782910000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "feedback_assignees" (
        "feedback_id" uuid NOT NULL REFERENCES "feedback"("id") ON DELETE CASCADE,
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "pk_feedback_assignees" PRIMARY KEY ("feedback_id", "user_id")
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_feedback_assignees_user" ON "feedback_assignees" ("user_id")`
    );

    // Carry forward any existing single assignment before dropping the column.
    await q.query(`
      INSERT INTO "feedback_assignees" ("feedback_id", "user_id")
      SELECT "id", "assigned_to_id" FROM "feedback" WHERE "assigned_to_id" IS NOT NULL
      ON CONFLICT DO NOTHING
    `);

    await q.query(`DROP INDEX IF EXISTS "idx_feedback_assigned_to"`);
    await q.query(`ALTER TABLE "feedback" DROP COLUMN IF EXISTS "assigned_to_id"`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "assigned_to_id" uuid REFERENCES "users"("id") ON DELETE SET NULL`
    );
    // Best-effort backfill — picks one assignee per feedback item when multiple exist.
    await q.query(`
      UPDATE "feedback" f SET "assigned_to_id" = sub.user_id
      FROM (SELECT DISTINCT ON (feedback_id) feedback_id, user_id FROM "feedback_assignees" ORDER BY feedback_id, user_id) sub
      WHERE f.id = sub.feedback_id
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_feedback_assigned_to" ON "feedback" ("assigned_to_id")`
    );
    await q.query(`DROP TABLE IF EXISTS "feedback_assignees"`);
  }
}
