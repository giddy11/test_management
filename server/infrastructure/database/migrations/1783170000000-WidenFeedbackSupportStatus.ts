// Migration: the IT-support tier gained a new stage — "awaiting_confirmation"
// (21 chars), reached by resolveLocally now that a local resolution awaits
// the submitter's confirm/reopen verdict instead of closing immediately.
// feedback.support_status was sized varchar(20) — one char too narrow —
// causing "value too long for type character varying(20)" on resolve. Widen
// to varchar(30), matching feedback_support_status_history.status, which was
// already sized for this.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class WidenFeedbackSupportStatus1783170000000 implements MigrationInterface {
  name = "WidenFeedbackSupportStatus1783170000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "feedback" ALTER COLUMN "support_status" TYPE varchar(30)`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "feedback" ALTER COLUMN "support_status" TYPE varchar(20)`);
  }
}
