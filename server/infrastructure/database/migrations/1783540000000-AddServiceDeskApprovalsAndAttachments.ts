// Migration: IT requests Phase 1b (attachments) and Phase 2 (the approval
// engine, escalation and reporting). See docs/it-service-requests-plan.md.
//
//   users.manager_id                    line manager — the "line_manager" approver rule
//   service_request_attachments         files on a request (images and documents)
//   service_approver_groups (+members)  named sets of approvers, each with the highest
//                                       risk level it may approve (its authority)
//   service_approval_policies           ordered approval steps (sequential); each step
//                                       needs any one, or all, of its approver rules
//   service_approval_delegations        "while I'm away, this person approves for me"
//   service_request_escalations         one row per escalation sent, so the sweeper
//                                       never sends the same one twice
//   + columns on catalog items (risk, policy, service-level overrides), requests
//     (risk, due dates, escalation levels, information requests), approvals
//     (step, rule, group, delegation, who actually decided) and settings
//     (service levels and escalation)
//
// Also: servicedesk.report, and the service_request_escalated notification type.
// Safe to re-run: IF NOT EXISTS / ON CONFLICT throughout.
import type { MigrationInterface, QueryRunner } from "typeorm";

const { BUILTIN_ROLES } = require("../../../modules/access/catalog/permissions.catalog");
const { seedCatalog } = require("../../../modules/access/services/accessSeed.service");

const NEW_CODES = ["servicedesk.report"];

export class AddServiceDeskApprovalsAndAttachments1783540000000 implements MigrationInterface {
  name = "AddServiceDeskApprovalsAndAttachments1783540000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "manager_id" uuid REFERENCES "users"("id") ON DELETE SET NULL`);
    await q.query(`CREATE INDEX IF NOT EXISTS "idx_users_manager_id" ON "users" ("manager_id")`);

    // ── Phase 1b: attachments ────────────────────────────────────────────────
    await q.query(`
      CREATE TABLE IF NOT EXISTS "service_request_attachments" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "request_id" uuid NOT NULL REFERENCES "service_requests"("id") ON DELETE CASCADE,
        "file_name" varchar(255) NOT NULL,
        "file_url" text NOT NULL,
        "file_public_id" varchar(255) NOT NULL,
        "resource_type" varchar(10) NOT NULL DEFAULT 'image',
        "mime_type" varchar(120),
        "file_size_bytes" int,
        "uploaded_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_service_request_attachments_request" ON "service_request_attachments" ("request_id", "created_at")`
    );

    // ── Phase 2: approver groups, policies, delegation ───────────────────────
    await q.query(`
      CREATE TABLE IF NOT EXISTS "service_approver_groups" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL,
        "name" varchar(80) NOT NULL,
        "description" varchar(300),
        "max_risk_level" varchar(10) NOT NULL DEFAULT 'medium',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_service_approver_groups_org_name" UNIQUE ("organization_id", "name")
      )
    `);
    await q.query(`
      CREATE TABLE IF NOT EXISTS "service_approver_group_members" (
        "group_id" uuid NOT NULL REFERENCES "service_approver_groups"("id") ON DELETE CASCADE,
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        PRIMARY KEY ("group_id", "user_id")
      )
    `);
    await q.query(`
      CREATE TABLE IF NOT EXISTS "service_approval_policies" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL,
        "name" varchar(80) NOT NULL,
        "description" varchar(300),
        "steps" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_service_approval_policies_org_name" UNIQUE ("organization_id", "name")
      )
    `);
    await q.query(`
      CREATE TABLE IF NOT EXISTS "service_approval_delegations" (
        "user_id" uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
        "organization_id" uuid NOT NULL,
        "delegate_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "starts_on" date NOT NULL,
        "ends_on" date NOT NULL,
        "note" varchar(200),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_service_approval_delegations_range" CHECK ("ends_on" >= "starts_on"),
        CONSTRAINT "chk_service_approval_delegations_self" CHECK ("delegate_id" <> "user_id")
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_service_approval_delegations_delegate" ON "service_approval_delegations" ("delegate_id")`
    );

    await q.query(`
      CREATE TABLE IF NOT EXISTS "service_request_escalations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "request_id" uuid NOT NULL REFERENCES "service_requests"("id") ON DELETE CASCADE,
        "phase" varchar(12) NOT NULL,
        "step_order" int NOT NULL DEFAULT 0,
        "level" int NOT NULL,
        "notified_user_ids" uuid[] NOT NULL DEFAULT '{}',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_service_request_escalations_once" UNIQUE ("request_id", "phase", "step_order", "level")
      )
    `);

    // ── New columns ──────────────────────────────────────────────────────────
    await q.query(`
      ALTER TABLE "service_catalog_items"
        ADD COLUMN IF NOT EXISTS "approval_policy_id" uuid REFERENCES "service_approval_policies"("id") ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS "risk_level" varchar(10) NOT NULL DEFAULT 'low',
        ADD COLUMN IF NOT EXISTS "approval_hours" int,
        ADD COLUMN IF NOT EXISTS "fulfilment_hours" int
    `);

    await q.query(`
      ALTER TABLE "service_requests"
        ADD COLUMN IF NOT EXISTS "risk_level" varchar(10) NOT NULL DEFAULT 'low',
        ADD COLUMN IF NOT EXISTS "current_step" int,
        ADD COLUMN IF NOT EXISTS "approval_due_at" timestamptz,
        ADD COLUMN IF NOT EXISTS "approval_target_hours" int,
        ADD COLUMN IF NOT EXISTS "approval_escalation_level" int NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "fulfilment_due_at" timestamptz,
        ADD COLUMN IF NOT EXISTS "fulfilment_target_hours" int,
        ADD COLUMN IF NOT EXISTS "fulfilment_escalation_level" int NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "info_requested_at" timestamptz,
        ADD COLUMN IF NOT EXISTS "info_requested_from" varchar(20),
        ADD COLUMN IF NOT EXISTS "info_requested_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_service_requests_approval_due" ON "service_requests" ("approval_due_at") WHERE "status" = 'pending_approval'`
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_service_requests_fulfilment_due" ON "service_requests" ("fulfilment_due_at") WHERE "status" IN ('submitted', 'approved', 'in_progress')`
    );

    await q.query(`
      ALTER TABLE "service_request_approvals"
        ADD COLUMN IF NOT EXISTS "step_name" varchar(80),
        ADD COLUMN IF NOT EXISTS "step_mode" varchar(5) NOT NULL DEFAULT 'any',
        ADD COLUMN IF NOT EXISTS "rule_index" int NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "group_id" uuid REFERENCES "service_approver_groups"("id") ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS "is_fallback" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "on_behalf_of_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS "decided_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS "authority_level" varchar(10)
    `);

    await q.query(`
      ALTER TABLE "service_desk_settings"
        ADD COLUMN IF NOT EXISTS "approval_hours" int NOT NULL DEFAULT 48,
        ADD COLUMN IF NOT EXISTS "fulfilment_hours" jsonb NOT NULL DEFAULT '{"critical":8,"high":24,"medium":72,"low":120}'::jsonb,
        ADD COLUMN IF NOT EXISTS "escalation" jsonb NOT NULL DEFAULT '{"level2Pct":50,"level3Pct":100,"contactIds":[]}'::jsonb
    `);

    await q.query(`ALTER TYPE "notifications_type_enum" ADD VALUE IF NOT EXISTS 'service_request_escalated'`);

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
    await q.query(`
      ALTER TABLE "service_desk_settings"
        DROP COLUMN IF EXISTS "approval_hours",
        DROP COLUMN IF EXISTS "fulfilment_hours",
        DROP COLUMN IF EXISTS "escalation"
    `);
    await q.query(`
      ALTER TABLE "service_request_approvals"
        DROP COLUMN IF EXISTS "step_name",
        DROP COLUMN IF EXISTS "step_mode",
        DROP COLUMN IF EXISTS "rule_index",
        DROP COLUMN IF EXISTS "group_id",
        DROP COLUMN IF EXISTS "is_fallback",
        DROP COLUMN IF EXISTS "on_behalf_of_id",
        DROP COLUMN IF EXISTS "decided_by_id",
        DROP COLUMN IF EXISTS "authority_level"
    `);
    await q.query(`DROP INDEX IF EXISTS "idx_service_requests_approval_due"`);
    await q.query(`DROP INDEX IF EXISTS "idx_service_requests_fulfilment_due"`);
    await q.query(`
      ALTER TABLE "service_requests"
        DROP COLUMN IF EXISTS "risk_level",
        DROP COLUMN IF EXISTS "current_step",
        DROP COLUMN IF EXISTS "approval_due_at",
        DROP COLUMN IF EXISTS "approval_target_hours",
        DROP COLUMN IF EXISTS "approval_escalation_level",
        DROP COLUMN IF EXISTS "fulfilment_due_at",
        DROP COLUMN IF EXISTS "fulfilment_target_hours",
        DROP COLUMN IF EXISTS "fulfilment_escalation_level",
        DROP COLUMN IF EXISTS "info_requested_at",
        DROP COLUMN IF EXISTS "info_requested_from",
        DROP COLUMN IF EXISTS "info_requested_by_id"
    `);
    await q.query(`
      ALTER TABLE "service_catalog_items"
        DROP COLUMN IF EXISTS "approval_policy_id",
        DROP COLUMN IF EXISTS "risk_level",
        DROP COLUMN IF EXISTS "approval_hours",
        DROP COLUMN IF EXISTS "fulfilment_hours"
    `);
    await q.query(`DROP TABLE IF EXISTS "service_request_escalations"`);
    await q.query(`DROP TABLE IF EXISTS "service_approval_delegations"`);
    await q.query(`DROP TABLE IF EXISTS "service_approval_policies"`);
    await q.query(`DROP TABLE IF EXISTS "service_approver_group_members"`);
    await q.query(`DROP TABLE IF EXISTS "service_approver_groups"`);
    await q.query(`DROP TABLE IF EXISTS "service_request_attachments"`);
    await q.query(`DROP INDEX IF EXISTS "idx_users_manager_id"`);
    await q.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "manager_id"`);
  }
}
