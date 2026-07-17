// Migration: reverts 1783110000000-AddProjectCompanyProvisioningKey.ts.
// POST /api/v1/integrations/companies no longer authenticates via a
// project-scoped key — it takes a projectId directly in the body instead, so
// this column set (and the admin UI to manage it) is dead. Written as a new
// migration rather than editing the original, since that one may already have
// run in some environment — every statement here is IF EXISTS-guarded so it's
// a safe no-op if it never did.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class DropProjectCompanyProvisioningKey1783120000000 implements MigrationInterface {
  name = "DropProjectCompanyProvisioningKey1783120000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "idx_projects_company_provisioning_key_hash"`);
    await q.query(`ALTER TABLE "projects" DROP COLUMN IF EXISTS "company_provisioning_key_created_at"`);
    await q.query(`ALTER TABLE "projects" DROP COLUMN IF EXISTS "company_provisioning_key_last_four"`);
    await q.query(`ALTER TABLE "projects" DROP COLUMN IF EXISTS "company_provisioning_key_hash"`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "company_provisioning_key_hash" varchar(255)`
    );
    await q.query(
      `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "company_provisioning_key_last_four" varchar(4)`
    );
    await q.query(
      `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "company_provisioning_key_created_at" timestamptz`
    );
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_projects_company_provisioning_key_hash" ON "projects" ("company_provisioning_key_hash") WHERE "company_provisioning_key_hash" IS NOT NULL`
    );
  }
}
