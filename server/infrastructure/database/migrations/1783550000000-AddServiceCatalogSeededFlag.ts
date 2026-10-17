// Migration: service_desk_settings.catalog_seeded — the starter IT-request
// catalog is created once per organisation, ever. Without the flag, an
// administrator who deleted every category (now possible for unused ones)
// would find the eight starter categories quietly re-created.
//
// Organisations that already have a catalog are marked seeded.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddServiceCatalogSeededFlag1783550000000 implements MigrationInterface {
  name = "AddServiceCatalogSeededFlag1783550000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "service_desk_settings" ADD COLUMN IF NOT EXISTS "catalog_seeded" boolean NOT NULL DEFAULT false`
    );
    await q.query(`
      INSERT INTO "service_desk_settings" ("organization_id", "catalog_seeded")
      SELECT DISTINCT "organization_id", true FROM "service_catalog_categories"
      ON CONFLICT ("organization_id") DO UPDATE SET "catalog_seeded" = true
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "service_desk_settings" DROP COLUMN IF EXISTS "catalog_seeded"`);
  }
}
