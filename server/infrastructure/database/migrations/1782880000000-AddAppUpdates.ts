// Migration: "what's new" announcements + per-user seen marker.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddAppUpdates1782880000000 implements MigrationInterface {
  name = "AddAppUpdates1782880000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "app_updates" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "title" varchar(200) NOT NULL,
        "body" text NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_app_updates" PRIMARY KEY ("id")
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_app_updates_created" ON "app_updates" ("created_at")`
    );
    await q.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "updates_seen_at" timestamptz`
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "updates_seen_at"`);
    await q.query(`DROP TABLE IF EXISTS "app_updates"`);
  }
}
