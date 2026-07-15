// Migration: track when IT support has relayed an escalated-and-closed
// item's fix to the original end user — a deliberate action, not automatic.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddFeedbackSubmitterNotifiedAt1783050000000 implements MigrationInterface {
  name = "AddFeedbackSubmitterNotifiedAt1783050000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "submitter_notified_at" timestamptz`
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "feedback" DROP COLUMN IF EXISTS "submitter_notified_at"`);
  }
}
