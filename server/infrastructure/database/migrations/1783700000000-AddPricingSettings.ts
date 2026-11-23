// Migration: the landing page's editable pricing section.
//
// - pricing_settings: one row (id "global") holding the section's content as
//   JSON. No row means the built-in defaults are shown.
// - pricing.manage: the platform-only permission that edits it. seedCatalog
//   adds the row for the role editor; no role is granted it, because it is
//   PLATFORM_ONLY and the super administrator's wildcard already covers it.
//
// Safe to re-run: IF NOT EXISTS, and seedCatalog upserts.
import type { MigrationInterface, QueryRunner } from "typeorm";

const { seedCatalog } = require("../../../modules/access/services/accessSeed.service");

export class AddPricingSettings1783700000000 implements MigrationInterface {
  name = "AddPricingSettings1783700000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "pricing_settings" (
        "id" varchar(20) PRIMARY KEY,
        "content" jsonb NOT NULL,
        "updated_by" uuid NULL,
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    const query = (sql: string, params?: unknown[]) => q.query(sql, params);
    await seedCatalog(query);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DELETE FROM "permissions" WHERE "code" = 'pricing.manage'`);
    await q.query(`DROP TABLE IF EXISTS "pricing_settings"`);
  }
}
