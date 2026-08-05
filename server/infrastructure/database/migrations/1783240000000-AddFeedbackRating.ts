// Migration: a resolved ticket's one-time submitter satisfaction rating (1-5 stars).
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddFeedbackRating1783240000000 implements MigrationInterface {
  name = "AddFeedbackRating1783240000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "rating" smallint`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "feedback" DROP COLUMN IF EXISTS "rating"`);
  }
}
