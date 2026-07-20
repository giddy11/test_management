// Migration: per-user preference for the notification/support-chat alert tone.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddNotificationSoundEnabledToUsers1783160000000 implements MigrationInterface {
  name = "AddNotificationSoundEnabledToUsers1783160000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "notification_sound_enabled" boolean NOT NULL DEFAULT true`
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "notification_sound_enabled"`);
  }
}
