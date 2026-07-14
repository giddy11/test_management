// Migration: two-tier feedback support.
// 1. users_role_enum gains 'it_support' (rename/recreate pattern — see AlignUserRoles).
// 2. client_companies table — external companies using a product, each with its
//    own public feedback form token.
// 3. users.client_company_id — scopes it_support accounts to their company.
// 4. feedback support-tier columns — client_company_id, support_status,
//    support_response, support_resolved_at, escalated_at, escalated_by_id.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddClientCompanySupport1782990000000 implements MigrationInterface {
  name = "AddClientCompanySupport1782990000000";

  async up(q: QueryRunner): Promise<void> {
    // ── 1. Add it_support to the users role enum ─────────────────────────────
    await q.query(`ALTER TYPE "users_role_enum" RENAME TO "users_role_enum_old"`);
    await q.query(
      `CREATE TYPE "users_role_enum" AS ENUM('superadmin','admin','user','it_support')`
    );
    await q.query(`ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT`);
    await q.query(
      `ALTER TABLE "users" ALTER COLUMN "role" TYPE "users_role_enum" USING "role"::text::"users_role_enum"`
    );
    await q.query(`ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'admin'`);
    await q.query(`DROP TYPE "users_role_enum_old"`);

    // ── 2. client_companies ──────────────────────────────────────────────────
    await q.query(`
      CREATE TABLE IF NOT EXISTS "client_companies" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "project_id" uuid NOT NULL,
        "name" varchar(200) NOT NULL,
        "contact_email" varchar(255),
        "feedback_token" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_client_companies" PRIMARY KEY ("id"),
        CONSTRAINT "fk_client_companies_project" FOREIGN KEY ("project_id")
          REFERENCES "projects"("id") ON DELETE CASCADE
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_client_companies_project" ON "client_companies" ("project_id")`
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_client_companies_feedback_token" ON "client_companies" ("feedback_token")`
    );

    // ── 3. users.client_company_id ───────────────────────────────────────────
    await q.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "client_company_id" uuid`);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_users_client_company_id" ON "users" ("client_company_id")`
    );

    // ── 4. feedback support-tier columns ─────────────────────────────────────
    await q.query(`ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "client_company_id" uuid`);
    await q.query(
      `ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "support_status" varchar(20)`
    );
    await q.query(`ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "support_response" text`);
    await q.query(
      `ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "support_resolved_at" timestamptz`
    );
    await q.query(`ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "escalated_at" timestamptz`);
    await q.query(`ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "escalated_by_id" uuid`);
    await q.query(`
      ALTER TABLE "feedback"
        ADD CONSTRAINT "fk_feedback_client_company" FOREIGN KEY ("client_company_id")
          REFERENCES "client_companies"("id") ON DELETE SET NULL
    `);
    await q.query(`
      ALTER TABLE "feedback"
        ADD CONSTRAINT "fk_feedback_escalated_by" FOREIGN KEY ("escalated_by_id")
          REFERENCES "users"("id") ON DELETE SET NULL
    `);
    await q.query(`
      CREATE INDEX IF NOT EXISTS "idx_feedback_company_support_created"
        ON "feedback" ("client_company_id", "support_status", "created_at")
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "idx_feedback_company_support_created"`);
    await q.query(`ALTER TABLE "feedback" DROP CONSTRAINT IF EXISTS "fk_feedback_escalated_by"`);
    await q.query(
      `ALTER TABLE "feedback" DROP CONSTRAINT IF EXISTS "fk_feedback_client_company"`
    );
    await q.query(`ALTER TABLE "feedback" DROP COLUMN IF EXISTS "escalated_by_id"`);
    await q.query(`ALTER TABLE "feedback" DROP COLUMN IF EXISTS "escalated_at"`);
    await q.query(`ALTER TABLE "feedback" DROP COLUMN IF EXISTS "support_resolved_at"`);
    await q.query(`ALTER TABLE "feedback" DROP COLUMN IF EXISTS "support_response"`);
    await q.query(`ALTER TABLE "feedback" DROP COLUMN IF EXISTS "support_status"`);
    await q.query(`ALTER TABLE "feedback" DROP COLUMN IF EXISTS "client_company_id"`);

    await q.query(`DROP INDEX IF EXISTS "idx_users_client_company_id"`);
    await q.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "client_company_id"`);

    await q.query(`DROP TABLE IF EXISTS "client_companies"`);

    await q.query(`UPDATE "users" SET "role" = 'user' WHERE "role" = 'it_support'`);
    await q.query(`ALTER TYPE "users_role_enum" RENAME TO "users_role_enum_old"`);
    await q.query(`CREATE TYPE "users_role_enum" AS ENUM('superadmin','admin','user')`);
    await q.query(`ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT`);
    await q.query(
      `ALTER TABLE "users" ALTER COLUMN "role" TYPE "users_role_enum" USING "role"::text::"users_role_enum"`
    );
    await q.query(`ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'admin'`);
    await q.query(`DROP TYPE "users_role_enum_old"`);
  }
}
