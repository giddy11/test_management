// Migration: targeted announcements — send to all users, all admins, or a
// hand-picked list of users.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddAppUpdateAudience1782970000000 implements MigrationInterface {
  name = "AddAppUpdateAudience1782970000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "app_updates" ADD COLUMN IF NOT EXISTS "audience" varchar(10) NOT NULL DEFAULT 'admins'`
    );
    await q.query(
      `ALTER TABLE "app_updates" ADD COLUMN IF NOT EXISTS "recipient_ids" uuid[]`
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "app_updates" DROP COLUMN IF EXISTS "recipient_ids"`);
    await q.query(`ALTER TABLE "app_updates" DROP COLUMN IF EXISTS "audience"`);
  }
}
