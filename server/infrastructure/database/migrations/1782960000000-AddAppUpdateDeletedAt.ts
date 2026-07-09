// Migration: soft-delete support for app updates (bulk delete from the
// Announcements page).
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddAppUpdateDeletedAt1782960000000 implements MigrationInterface {
  name = "AddAppUpdateDeletedAt1782960000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "app_updates" ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz`
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "app_updates" DROP COLUMN IF EXISTS "deleted_at"`);
  }
}
