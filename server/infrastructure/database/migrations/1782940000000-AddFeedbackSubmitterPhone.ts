// Migration: optional phone number for the external submitter, collected on
// the public feedback form (E.164 format, e.g. "+2348012345678").
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddFeedbackSubmitterPhone1782940000000 implements MigrationInterface {
  name = "AddFeedbackSubmitterPhone1782940000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "submitter_phone" varchar(30)`
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "feedback" DROP COLUMN IF EXISTS "submitter_phone"`);
  }
}
