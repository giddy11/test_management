// Migration: optional reason the submitter gives when rejecting a resolution
// via the confirmation link (status moves back to "investigating").
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddFeedbackReopenReason1782930000000 implements MigrationInterface {
  name = "AddFeedbackReopenReason1782930000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "reopen_reason" text`
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "feedback" DROP COLUMN IF EXISTS "reopen_reason"`);
  }
}
