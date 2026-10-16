// Migration: AI credits — a metered balance spent only when a request runs on
// the organisation's key (a user's own key is never charged).
//
//   ai_credit_accounts      one balance per user; CHECK balance >= 0
//   ai_credit_transactions  append-only ledger, one row per balance change,
//                           written in the same transaction as the change
//   ai_settings             per-organisation prices { feature: credits }
//
// Prices default to none, so deploying this changes nothing until an admin
// sets one: a missing price is free.
//
// Also adds ai.managecredits and grants it to every existing built-in role
// whose catalog definition holds it (the seed never grants a new permission to
// an existing role — see AddAiPermissions for the same pattern).
import type { MigrationInterface, QueryRunner } from "typeorm";

const { BUILTIN_ROLES } = require("../../../modules/access/catalog/permissions.catalog");
const { seedCatalog } = require("../../../modules/access/services/accessSeed.service");

const NEW_CODES = ["ai.managecredits"];

export class AddAiCredits1783520000000 implements MigrationInterface {
  name = "AddAiCredits1783520000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "ai_credit_accounts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
        "organization_id" uuid NOT NULL,
        "balance" int NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_ai_credit_accounts_balance" CHECK ("balance" >= 0)
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_ai_credit_accounts_org" ON "ai_credit_accounts" ("organization_id")`
    );

    await q.query(`
      CREATE TABLE IF NOT EXISTS "ai_credit_transactions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "organization_id" uuid NOT NULL,
        "type" varchar(20) NOT NULL,
        "amount" int NOT NULL,
        "balance_after" int NOT NULL,
        "feature" varchar(50),
        "note" varchar(300),
        "used_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
        "detail" varchar(300),
        "actor_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "hidden_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_ai_credit_transactions_type" CHECK ("type" IN ('grant', 'adjustment', 'usage', 'refund', 'purchase'))
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_ai_credit_transactions_user_created" ON "ai_credit_transactions" ("user_id", "created_at")`
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_ai_credit_transactions_org_created" ON "ai_credit_transactions" ("organization_id", "created_at")`
    );

    await q.query(`
      CREATE TABLE IF NOT EXISTS "ai_settings" (
        "organization_id" uuid PRIMARY KEY,
        "credit_prices" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "updated_by_id" uuid,
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    const query = (sql: string, params?: unknown[]) => q.query(sql, params);
    await seedCatalog(query);
    for (const code of NEW_CODES) {
      const roleKeys: string[] = BUILTIN_ROLES.filter(
        (r: { key: string; permissions: string[]; isLocked?: boolean }) =>
          !r.isLocked && r.permissions.includes(code)
      ).map((r: { key: string }) => r.key);
      if (!roleKeys.length) continue;
      await q.query(
        `INSERT INTO "role_permissions" ("role_id", "permission_code")
         SELECT r."id", $1 FROM "roles" r
          WHERE r."key" = ANY($2::varchar[]) AND r."is_builtin" = true
         ON CONFLICT DO NOTHING`,
        [code, roleKeys]
      );
    }
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DELETE FROM "permissions" WHERE "code" = ANY($1::varchar[])`, [NEW_CODES]);
    await q.query(`DROP TABLE IF EXISTS "ai_settings"`);
    await q.query(`DROP TABLE IF EXISTS "ai_credit_transactions"`);
    await q.query(`DROP TABLE IF EXISTS "ai_credit_accounts"`);
  }
}
