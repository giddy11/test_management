// Migration: per-stage timing for external feedback. Records the moment each
// feedback item entered every lifecycle stage, so stage durations (and a
// timeline) can be reconstructed later without re-deriving them from the
// generic activity log.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddFeedbackStatusHistory1782920000000 implements MigrationInterface {
  name = "AddFeedbackStatusHistory1782920000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "feedback_status_history" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "feedback_id" uuid NOT NULL REFERENCES "feedback"("id") ON DELETE CASCADE,
        "status" varchar(30) NOT NULL,
        "entered_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_feedback_status_history" PRIMARY KEY ("id")
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_feedback_status_history_feedback" ON "feedback_status_history" ("feedback_id", "entered_at")`
    );

    // Backfill: we only ever knew two points in time for existing rows — when
    // they were logged, and when they last changed status. Intermediate
    // stages (if any were skipped through before this table existed) can't be
    // reconstructed, so we seed just those two known points.
    await q.query(`
      INSERT INTO "feedback_status_history" ("feedback_id", "status", "entered_at")
      SELECT "id", 'logged', "created_at" FROM "feedback"
    `);
    await q.query(`
      INSERT INTO "feedback_status_history" ("feedback_id", "status", "entered_at")
      SELECT "id", "status", COALESCE("status_updated_at", "created_at")
      FROM "feedback" WHERE "status" != 'logged'
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "feedback_status_history"`);
  }
}
