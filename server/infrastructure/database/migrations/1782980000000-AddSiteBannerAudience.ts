// Migration: targeted site banner — send to all users, all admins, or a
// hand-picked list of users.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddSiteBannerAudience1782980000000 implements MigrationInterface {
  name = "AddSiteBannerAudience1782980000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "site_banner" ADD COLUMN IF NOT EXISTS "audience" varchar(10) NOT NULL DEFAULT 'all'`
    );
    await q.query(
      `ALTER TABLE "site_banner" ADD COLUMN IF NOT EXISTS "recipient_ids" uuid[]`
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "site_banner" DROP COLUMN IF EXISTS "recipient_ids"`);
    await q.query(`ALTER TABLE "site_banner" DROP COLUMN IF EXISTS "audience"`);
  }
}
