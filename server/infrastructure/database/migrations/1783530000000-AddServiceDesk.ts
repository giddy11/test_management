// Migration: IT requests (modules/serviceDesk) — a module of its own, separate
// from testing, that shares only sign-in, people, permissions, notifications
// and the audit log. See docs/it-service-requests-plan.md.
//
//   service_desk_settings            one row per organisation; enabled is off
//                                    until an administrator turns it on
//   service_catalog_categories       what people can ask for, grouped
//   service_catalog_items            one requestable thing: its form and approvers
//   service_requests                 a request, with a snapshot of the item it
//                                    was raised against (forms change later)
//   service_request_approvals        one row per approver; any one decides
//   service_request_status_history   every transition, who and when
//   service_request_comments         the conversation, plus IT-only notes
//
// Also: the three servicedesk permissions, the Employee and IT service agent
// built-in roles for every existing organisation, and three notification types.
// Safe to re-run: IF NOT EXISTS / ON CONFLICT throughout.
import type { MigrationInterface, QueryRunner } from "typeorm";

const { BUILTIN_ROLES } = require("../../../modules/access/catalog/permissions.catalog");
const { seedCatalog, seedAllOrganizations } = require("../../../modules/access/services/accessSeed.service");

const NEW_CODES = ["servicerequest.create", "servicedesk.work", "servicedesk.manage"];
const NEW_NOTIFICATION_TYPES = ["service_request_approval", "service_request_queued", "service_request_update"];

export class AddServiceDesk1783530000000 implements MigrationInterface {
  name = "AddServiceDesk1783530000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "service_desk_settings" (
        "organization_id" uuid PRIMARY KEY,
        "enabled" boolean NOT NULL DEFAULT false,
        "updated_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await q.query(`
      CREATE TABLE IF NOT EXISTS "service_catalog_categories" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL,
        "key" varchar(40) NOT NULL,
        "name" varchar(80) NOT NULL,
        "description" varchar(300),
        "icon" varchar(40),
        "sort_order" int NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_service_catalog_categories_org_key" UNIQUE ("organization_id", "key")
      )
    `);

    await q.query(`
      CREATE TABLE IF NOT EXISTS "service_catalog_items" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL,
        "category_id" uuid NOT NULL REFERENCES "service_catalog_categories"("id") ON DELETE CASCADE,
        "name" varchar(120) NOT NULL,
        "description" text,
        "form_schema" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "approval_mode" varchar(20) NOT NULL DEFAULT 'none',
        "approver_ids" uuid[] NOT NULL DEFAULT '{}',
        "fulfilment_notes" text,
        "is_active" boolean NOT NULL DEFAULT true,
        "sort_order" int NOT NULL DEFAULT 0,
        "version" int NOT NULL DEFAULT 1,
        "created_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_service_catalog_items_org_category" ON "service_catalog_items" ("organization_id", "category_id")`
    );

    await q.query(`
      CREATE TABLE IF NOT EXISTS "service_requests" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "request_number" SERIAL NOT NULL UNIQUE,
        "organization_id" uuid NOT NULL,
        "catalog_item_id" uuid REFERENCES "service_catalog_items"("id") ON DELETE SET NULL,
        "item_snapshot" jsonb NOT NULL,
        "requester_id" uuid NOT NULL REFERENCES "users"("id"),
        "requested_for_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "requested_for_name" varchar(120),
        "requested_for_email" varchar(255),
        "title" varchar(200) NOT NULL,
        "description" text,
        "business_justification" text,
        "priority" varchar(10) NOT NULL DEFAULT 'medium',
        "form_values" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "status" varchar(20) NOT NULL DEFAULT 'draft',
        "assignee_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "resolution_note" text,
        "submitted_at" timestamptz,
        "approved_at" timestamptz,
        "started_at" timestamptz,
        "fulfilled_at" timestamptz,
        "cancelled_at" timestamptz,
        "status_updated_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_service_requests_org_status" ON "service_requests" ("organization_id", "status", "created_at")`
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_service_requests_requester" ON "service_requests" ("requester_id", "created_at")`
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_service_requests_requested_for" ON "service_requests" ("requested_for_id")`
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_service_requests_assignee" ON "service_requests" ("assignee_id")`
    );

    await q.query(`
      CREATE TABLE IF NOT EXISTS "service_request_approvals" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "request_id" uuid NOT NULL REFERENCES "service_requests"("id") ON DELETE CASCADE,
        "step_order" int NOT NULL DEFAULT 1,
        "approver_id" uuid NOT NULL REFERENCES "users"("id"),
        "decision" varchar(10) NOT NULL DEFAULT 'pending',
        "comment" text,
        "decided_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_service_request_approvals_step_approver" UNIQUE ("request_id", "step_order", "approver_id")
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_service_request_approvals_approver" ON "service_request_approvals" ("approver_id", "decision")`
    );

    await q.query(`
      CREATE TABLE IF NOT EXISTS "service_request_status_history" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "request_id" uuid NOT NULL REFERENCES "service_requests"("id") ON DELETE CASCADE,
        "from_status" varchar(20),
        "to_status" varchar(20) NOT NULL,
        "actor_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "note" text,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_service_request_status_history_request" ON "service_request_status_history" ("request_id", "created_at")`
    );

    await q.query(`
      CREATE TABLE IF NOT EXISTS "service_request_comments" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "request_id" uuid NOT NULL REFERENCES "service_requests"("id") ON DELETE CASCADE,
        "author_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "body" text NOT NULL,
        "is_internal" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_service_request_comments_request" ON "service_request_comments" ("request_id", "created_at")`
    );

    // Postgres can't use a freshly added enum value in the same transaction,
    // and nothing here does — the values are only written at runtime.
    for (const value of NEW_NOTIFICATION_TYPES) {
      await q.query(`ALTER TYPE "notifications_type_enum" ADD VALUE IF NOT EXISTS '${value}'`);
    }

    // Permissions, then the two new built-in roles for every organisation that
    // exists today (a new organisation gets them from the normal seed). The
    // seed never resets an existing role's permissions, so each new code is
    // granted below to every existing built-in role whose catalog definition
    // holds it — the AddAiPermissions pattern.
    const query = (sql: string, params?: unknown[]) => q.query(sql, params);
    await seedCatalog(query);
    await seedAllOrganizations(query);
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
    // The two roles go only where nobody holds them; a role with members is
    // left as it is rather than strip people of access.
    await q.query(
      `DELETE FROM "roles" r
        WHERE r."key" = ANY($1::varchar[]) AND r."is_builtin" = true
          AND NOT EXISTS (SELECT 1 FROM "user_roles" ur WHERE ur."role_id" = r."id")`,
      [["employee", "it_agent"]]
    );
    await q.query(`DELETE FROM "permissions" WHERE "code" = ANY($1::varchar[])`, [NEW_CODES]);
    await q.query(`DELETE FROM "permission_categories" WHERE "key" = 'servicedesk'`);
    await q.query(`DROP TABLE IF EXISTS "service_request_comments"`);
    await q.query(`DROP TABLE IF EXISTS "service_request_status_history"`);
    await q.query(`DROP TABLE IF EXISTS "service_request_approvals"`);
    await q.query(`DROP TABLE IF EXISTS "service_requests"`);
    await q.query(`DROP TABLE IF EXISTS "service_catalog_items"`);
    await q.query(`DROP TABLE IF EXISTS "service_catalog_categories"`);
    await q.query(`DROP TABLE IF EXISTS "service_desk_settings"`);
    // notifications_type_enum values stay: Postgres has no DROP VALUE.
  }
}
