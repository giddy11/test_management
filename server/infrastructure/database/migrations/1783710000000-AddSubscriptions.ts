// Migration: plans per organisation.
//
// - plan_entitlements: what each plan (free / standard / enterprise) unlocks,
//   as edited by the platform owner. No row = the built-in defaults.
// - organization_subscriptions: which plan an organisation is on. No row =
//   Free, which is where every existing organisation starts.
// - subscription_payments: payments the platform owner records by hand
//   (bank transfer, cash...). Append-only.
// - subscription.manage: the platform-only permission for all of the above.
//   seedCatalog adds it; no role is granted it, because it is PLATFORM_ONLY
//   and the super administrator's wildcard already covers it.
//
// Safe to re-run: IF NOT EXISTS, and seedCatalog upserts.
import type { MigrationInterface, QueryRunner } from "typeorm";

const { seedCatalog } = require("../../../modules/access/services/accessSeed.service");

export class AddSubscriptions1783710000000 implements MigrationInterface {
  name = "AddSubscriptions1783710000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "plan_entitlements" (
        "plan_key" varchar(20) PRIMARY KEY,
        "features" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "limits" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "updated_by" uuid NULL,
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await q.query(`
      CREATE TABLE IF NOT EXISTS "organization_subscriptions" (
        "organization_id" uuid PRIMARY KEY,
        "plan_key" varchar(20) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'active',
        "trial_ends_at" timestamptz NULL,
        "paid_until" timestamptz NULL,
        "source" varchar(30) NOT NULL DEFAULT 'manual',
        "note" text NULL,
        "updated_by" uuid NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_organization_subscriptions_status" CHECK ("status" IN ('active', 'trial'))
      )
    `);

    await q.query(`
      CREATE TABLE IF NOT EXISTS "subscription_payments" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL,
        "plan_key" varchar(20) NOT NULL,
        "amount" numeric(14, 2) NOT NULL,
        "currency" varchar(10) NOT NULL,
        "method" varchar(30) NOT NULL,
        "reference" varchar(120) NULL,
        "paid_at" timestamptz NOT NULL,
        "period_start" timestamptz NOT NULL,
        "period_end" timestamptz NOT NULL,
        "note" text NULL,
        "recorded_by" uuid NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_subscription_payments_org" ON "subscription_payments" ("organization_id", "paid_at")`
    );

    const query = (sql: string, params?: unknown[]) => q.query(sql, params);
    await seedCatalog(query);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DELETE FROM "permissions" WHERE "code" = 'subscription.manage'`);
    await q.query(`DROP TABLE IF EXISTS "subscription_payments"`);
    await q.query(`DROP TABLE IF EXISTS "organization_subscriptions"`);
    await q.query(`DROP TABLE IF EXISTS "plan_entitlements"`);
  }
}
