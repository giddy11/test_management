// Migration: IT support tier gets a full stage lifecycle
// (logged → acknowledged → investigating → resolved | escalated).
// 1. feedback_support_status_history — one row per IT stage entered (separate
//    from feedback_status_history, which is the product team's timeline).
// 2. Data fix: the tier's initial single-state value was "open" — rename to
//    "logged" (no-op on databases that never held "open" rows).
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddSupportStatusFlow1783000000000 implements MigrationInterface {
  name = "AddSupportStatusFlow1783000000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "feedback_support_status_history" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "feedback_id" uuid NOT NULL,
        "status" varchar(30) NOT NULL,
        "entered_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "pk_feedback_support_status_history" PRIMARY KEY ("id"),
        CONSTRAINT "fk_feedback_support_status_history_feedback" FOREIGN KEY ("feedback_id")
          REFERENCES "feedback"("id") ON DELETE CASCADE
      )
    `);
    await q.query(`
      CREATE INDEX IF NOT EXISTS "idx_feedback_support_status_history_feedback"
        ON "feedback_support_status_history" ("feedback_id", "entered_at")
    `);

    await q.query(`UPDATE "feedback" SET "support_status" = 'logged' WHERE "support_status" = 'open'`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`UPDATE "feedback" SET "support_status" = 'open' WHERE "support_status" IN ('logged','acknowledged','investigating')`);
    await q.query(`DROP TABLE IF EXISTS "feedback_support_status_history"`);
  }
}
