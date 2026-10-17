// Migration: IT requests Phase 3 — automation rules, fulfilment connectors,
// identity checks and AI triage. See docs/it-service-requests-plan.md.
//
//   service_webhook_endpoints   connectors (Power Automate, Logic Apps, n8n…);
//                               the URL and signing secret are sealed (secretBox)
//   service_automation_rules    conditions → actions, evaluated at submit
//   service_automation_runs     every automated thing that happened (or was
//                               refused), with its outcome — the trace story 2
//                               asks for (AC 2.9)
//   + catalog items: fulfilment type and config, may-auto-approve, privileged,
//     requires an identity check
//   + requests: review flag, auto-approved, automation status, how it was
//     fulfilled, the identity check, AI triage
//
// Also: serviceautomation.manage, and the starter "Password reset" item now
// requires an identity check (BR 1.5).
import type { MigrationInterface, QueryRunner } from "typeorm";

const { BUILTIN_ROLES } = require("../../../modules/access/catalog/permissions.catalog");
const { seedCatalog } = require("../../../modules/access/services/accessSeed.service");

const NEW_CODES = ["serviceautomation.manage"];
// An existing code newly added to the two IT-requests roles (AI intake/triage).
const NEWLY_GRANTED = { code: "ai.use", roles: ["employee", "it_agent"] };

export class AddServiceDeskAutomation1783560000000 implements MigrationInterface {
  name = "AddServiceDeskAutomation1783560000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "service_webhook_endpoints" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL,
        "name" varchar(80) NOT NULL,
        "url_display" varchar(300) NOT NULL,
        "url_sealed" text NOT NULL,
        "secret_sealed" text NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "last_success_at" timestamptz,
        "last_failure_at" timestamptz,
        "last_failure" varchar(300),
        "created_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_service_webhook_endpoints_org_name" UNIQUE ("organization_id", "name")
      )
    `);

    await q.query(`
      CREATE TABLE IF NOT EXISTS "service_automation_rules" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL,
        "name" varchar(80) NOT NULL,
        "description" varchar(300),
        "sort_order" int NOT NULL DEFAULT 100,
        "is_active" boolean NOT NULL DEFAULT true,
        "conditions" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "actions" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_service_automation_rules_org" ON "service_automation_rules" ("organization_id", "sort_order")`
    );

    await q.query(`
      CREATE TABLE IF NOT EXISTS "service_automation_runs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL,
        "request_id" uuid NOT NULL REFERENCES "service_requests"("id") ON DELETE CASCADE,
        "kind" varchar(20) NOT NULL,
        "status" varchar(12) NOT NULL,
        "rule_id" uuid REFERENCES "service_automation_rules"("id") ON DELETE SET NULL,
        "rule_name" varchar(80),
        "endpoint_id" uuid REFERENCES "service_webhook_endpoints"("id") ON DELETE SET NULL,
        "attempt" int NOT NULL DEFAULT 0,
        "next_attempt_at" timestamptz,
        "callback_token_hash" varchar(64),
        "detail" jsonb,
        "error" varchar(500),
        "initiated_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "started_at" timestamptz NOT NULL DEFAULT now(),
        "finished_at" timestamptz
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_service_automation_runs_request" ON "service_automation_runs" ("request_id", "started_at")`
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_service_automation_runs_org" ON "service_automation_runs" ("organization_id", "started_at")`
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_service_automation_runs_due" ON "service_automation_runs" ("next_attempt_at") WHERE "status" IN ('retrying', 'pending')`
    );

    await q.query(`
      ALTER TABLE "service_catalog_items"
        ADD COLUMN IF NOT EXISTS "fulfilment_type" varchar(10) NOT NULL DEFAULT 'manual',
        ADD COLUMN IF NOT EXISTS "fulfilment_config" jsonb NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS "auto_approve" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "is_privileged" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "requires_identity_check" boolean NOT NULL DEFAULT false
    `);

    await q.query(`
      ALTER TABLE "service_requests"
        ADD COLUMN IF NOT EXISTS "needs_review" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "review_reason" varchar(500),
        ADD COLUMN IF NOT EXISTS "auto_approved" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "automation_status" varchar(12),
        ADD COLUMN IF NOT EXISTS "fulfilled_by" varchar(12),
        ADD COLUMN IF NOT EXISTS "identity_verified_at" timestamptz,
        ADD COLUMN IF NOT EXISTS "identity_verified_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS "identity_method" varchar(60),
        ADD COLUMN IF NOT EXISTS "identity_note" text,
        ADD COLUMN IF NOT EXISTS "ai_triage" jsonb
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_service_requests_needs_review" ON "service_requests" ("organization_id") WHERE "needs_review" = true`
    );

    // BR 1.5: password resets follow identity verification.
    await q.query(`
      UPDATE "service_catalog_items" i SET "requires_identity_check" = true
        FROM "service_catalog_categories" c
       WHERE c."id" = i."category_id" AND c."key" = 'password_reset'
         AND i."name" = 'Password reset or account unlock'
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
    await q.query(
      `INSERT INTO "role_permissions" ("role_id", "permission_code")
       SELECT r."id", $1 FROM "roles" r
        WHERE r."key" = ANY($2::varchar[]) AND r."is_builtin" = true
       ON CONFLICT DO NOTHING`,
      [NEWLY_GRANTED.code, NEWLY_GRANTED.roles]
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DELETE FROM "permissions" WHERE "code" = ANY($1::varchar[])`, [NEW_CODES]);
    await q.query(`DROP INDEX IF EXISTS "idx_service_requests_needs_review"`);
    await q.query(`
      ALTER TABLE "service_requests"
        DROP COLUMN IF EXISTS "needs_review",
        DROP COLUMN IF EXISTS "review_reason",
        DROP COLUMN IF EXISTS "auto_approved",
        DROP COLUMN IF EXISTS "automation_status",
        DROP COLUMN IF EXISTS "fulfilled_by",
        DROP COLUMN IF EXISTS "identity_verified_at",
        DROP COLUMN IF EXISTS "identity_verified_by_id",
        DROP COLUMN IF EXISTS "identity_method",
        DROP COLUMN IF EXISTS "identity_note",
        DROP COLUMN IF EXISTS "ai_triage"
    `);
    await q.query(`
      ALTER TABLE "service_catalog_items"
        DROP COLUMN IF EXISTS "fulfilment_type",
        DROP COLUMN IF EXISTS "fulfilment_config",
        DROP COLUMN IF EXISTS "auto_approve",
        DROP COLUMN IF EXISTS "is_privileged",
        DROP COLUMN IF EXISTS "requires_identity_check"
    `);
    await q.query(`DROP TABLE IF EXISTS "service_automation_runs"`);
    await q.query(`DROP TABLE IF EXISTS "service_automation_rules"`);
    await q.query(`DROP TABLE IF EXISTS "service_webhook_endpoints"`);
  }
}
