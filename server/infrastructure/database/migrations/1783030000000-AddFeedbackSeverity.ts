// Migration: IT support sets a severity when escalating a feedback item to
// the product team — null until then, never set on direct submissions.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddFeedbackSeverity1783030000000 implements MigrationInterface {
  name = "AddFeedbackSeverity1783030000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "severity" varchar(20)`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "feedback" DROP COLUMN IF EXISTS "severity"`);
  }
}
