// Migration: IT requests no longer have automation. Removes what
// 1783560000000-AddServiceDeskAutomation added for it — rules, automatic
// approval, webhook connectors, the run log, the review flag, and self-service
// links — and the serviceautomation.manage permission.
//
// Kept from that migration: identity checks (items' requires_identity_check,
// requests' identity_*) and AI triage (requests' ai_triage).
//
// Every catalog item is now fulfilled by a person in IT. Requests that were
// fulfilled automatically or through self-service stay fulfilled; only how
// they were fulfilled is no longer recorded.
import type { MigrationInterface, QueryRunner } from "typeorm";

const REMOVED_CODES = ["serviceautomation.manage"];

export class RemoveServiceDeskAutomation1783630000000 implements MigrationInterface {
  name = "RemoveServiceDeskAutomation1783630000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`DELETE FROM "role_permissions" WHERE "permission_code" = ANY($1::varchar[])`, [REMOVED_CODES]);
    await q.query(`DELETE FROM "permissions" WHERE "code" = ANY($1::varchar[])`, [REMOVED_CODES]);

    await q.query(`DROP TABLE IF EXISTS "service_automation_runs"`);
    await q.query(`DROP TABLE IF EXISTS "service_automation_rules"`);
    await q.query(`DROP TABLE IF EXISTS "service_webhook_endpoints"`);

    await q.query(`DROP INDEX IF EXISTS "idx_service_requests_needs_review"`);
    await q.query(`
      ALTER TABLE "service_requests"
        DROP COLUMN IF EXISTS "needs_review",
        DROP COLUMN IF EXISTS "review_reason",
        DROP COLUMN IF EXISTS "auto_approved",
        DROP COLUMN IF EXISTS "automation_status",
        DROP COLUMN IF EXISTS "fulfilled_by"
    `);
    await q.query(`
      ALTER TABLE "service_catalog_items"
        DROP COLUMN IF EXISTS "fulfilment_type",
        DROP COLUMN IF EXISTS "fulfilment_config",
        DROP COLUMN IF EXISTS "auto_approve",
        DROP COLUMN IF EXISTS "is_privileged"
    `);
  }

  // Puts the schema back (empty). The permission itself isn't restored: it
  // only exists while permissions.catalog.js lists it, and the seed adds it.
  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE "service_catalog_items"
        ADD COLUMN IF NOT EXISTS "fulfilment_type" varchar(10) NOT NULL DEFAULT 'manual',
        ADD COLUMN IF NOT EXISTS "fulfilment_config" jsonb NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS "auto_approve" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "is_privileged" boolean NOT NULL DEFAULT false
    `);
    await q.query(`
      ALTER TABLE "service_requests"
        ADD COLUMN IF NOT EXISTS "needs_review" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "review_reason" varchar(500),
        ADD COLUMN IF NOT EXISTS "auto_approved" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "automation_status" varchar(12),
        ADD COLUMN IF NOT EXISTS "fulfilled_by" varchar(12)
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_service_requests_needs_review" ON "service_requests" ("organization_id") WHERE "needs_review" = true`
    );

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
  }
}
