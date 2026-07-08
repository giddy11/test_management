// Migration: feedback suite/module label + screenshot attachments.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddFeedbackSuiteAndAttachments1782900000000 implements MigrationInterface {
  name = "AddFeedbackSuiteAndAttachments1782900000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "suite_name" varchar(200)`
    );
    await q.query(`
      CREATE TABLE IF NOT EXISTS "feedback_attachments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "feedback_id" uuid NOT NULL REFERENCES "feedback"("id") ON DELETE CASCADE,
        "url" varchar(500) NOT NULL,
        "public_id" varchar(255) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_feedback_attachments" PRIMARY KEY ("id")
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_feedback_attachments_feedback" ON "feedback_attachments" ("feedback_id")`
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "feedback_attachments"`);
    await q.query(`ALTER TABLE "feedback" DROP COLUMN IF EXISTS "suite_name"`);
  }
}
