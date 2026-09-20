// Migration: permission-based access control.
//
// Creates the catalog (permissions, permission_categories) and the role model
// (roles, role_permissions, user_roles), seeds the built-in roles for every
// existing organisation, and grants every existing user the role their legacy
// users.role maps to.
//
// users.role is deliberately NOT dropped. It stays for one release as the
// migration source and as a fallback while the client is updated; user_roles is
// the source of truth from here on. See docs/access-model.md section 7.
import type { MigrationInterface, QueryRunner } from "typeorm";

const { seedAccess } = require("../../../modules/access/services/accessSeed.service");

export class AddPermissionsAndRoles1783290000000 implements MigrationInterface {
  name = "AddPermissionsAndRoles1783290000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "permission_categories" (
        "key" varchar(40) PRIMARY KEY,
        "label" varchar(80) NOT NULL,
        "description" text,
        "sort_order" int NOT NULL DEFAULT 0
      )
    `);

    await q.query(`
      CREATE TABLE IF NOT EXISTS "permissions" (
        "code" varchar(64) PRIMARY KEY,
        "category" varchar(40) NOT NULL,
        "label" varchar(120) NOT NULL,
        "description" text,
        "warning" text,
        "sort_order" int NOT NULL DEFAULT 0
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_permissions_category" ON "permissions" ("category", "sort_order")`
    );

    await q.query(`
      CREATE TABLE IF NOT EXISTS "roles" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organization_id" uuid,
        "key" varchar(60),
        "name" varchar(80) NOT NULL,
        "description" text,
        "is_builtin" boolean NOT NULL DEFAULT false,
        "is_locked" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_roles_organization_id" ON "roles" ("organization_id")`
    );
    // One copy of each built-in role per organisation...
    await q.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_roles_org_key" ON "roles" ("organization_id", "key")
      WHERE "key" IS NOT NULL AND "organization_id" IS NOT NULL
    `);
    // ...and exactly one platform-level role, since Postgres treats NULLs as
    // distinct and the index above would not catch a duplicate super role.
    await q.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_roles_platform_key" ON "roles" ("key")
      WHERE "key" IS NOT NULL AND "organization_id" IS NULL
    `);
    // Role names are what an admin types; keep them unique per organisation,
    // case-insensitively, so "Auditor" and "auditor" can't both exist.
    await q.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_roles_org_name" ON "roles" ("organization_id", lower("name"))
      WHERE "organization_id" IS NOT NULL
    `);

    await q.query(`
      CREATE TABLE IF NOT EXISTS "role_permissions" (
        "role_id" uuid NOT NULL REFERENCES "roles" ("id") ON DELETE CASCADE,
        "permission_code" varchar(64) NOT NULL REFERENCES "permissions" ("code") ON DELETE CASCADE,
        PRIMARY KEY ("role_id", "permission_code")
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_role_permissions_code" ON "role_permissions" ("permission_code")`
    );

    await q.query(`
      CREATE TABLE IF NOT EXISTS "user_roles" (
        "user_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
        "role_id" uuid NOT NULL REFERENCES "roles" ("id") ON DELETE CASCADE,
        "granted_by" uuid,
        "granted_at" timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("user_id", "role_id")
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_user_roles_role" ON "user_roles" ("role_id")`
    );

    // Same seed the CLI script runs — see accessSeed.service.js.
    const result = await seedAccess((sql: string, params?: unknown[]) => q.query(sql, params));
    console.info(
      `[migration] Seeded access catalog for ${result.organizations} organisation(s); ` +
        `granted roles to ${result.usersGranted} user(s).`
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "user_roles"`);
    await q.query(`DROP TABLE IF EXISTS "role_permissions"`);
    await q.query(`DROP TABLE IF EXISTS "roles"`);
    await q.query(`DROP TABLE IF EXISTS "permissions"`);
    await q.query(`DROP TABLE IF EXISTS "permission_categories"`);
  }
}
