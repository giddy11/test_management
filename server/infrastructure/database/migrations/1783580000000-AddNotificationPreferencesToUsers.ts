// Migration: per-user opt-outs for in-app and email notifications by app area
// (Settings → Notifications). Empty means every category is on.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddNotificationPreferencesToUsers1783580000000 implements MigrationInterface {
  name = "AddNotificationPreferencesToUsers1783580000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "notification_preferences" jsonb NOT NULL DEFAULT '{}'`
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "notification_preferences"`);
  }
}
