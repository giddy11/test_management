// Migration: site-wide broadcast banner — single toggle-able row.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddSiteBanner1782950000000 implements MigrationInterface {
  name = "AddSiteBanner1782950000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "site_banner" (
        "id" varchar(20) NOT NULL,
        "message" text,
        "is_active" boolean NOT NULL DEFAULT false,
        "duration_minutes" integer,
        "started_at" timestamptz,
        "expires_at" timestamptz,
        "updated_by" uuid,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_site_banner" PRIMARY KEY ("id")
      )
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "site_banner"`);
  }
}
