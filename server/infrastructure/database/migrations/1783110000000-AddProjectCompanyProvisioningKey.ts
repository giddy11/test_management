// Migration: a project-level API key that lets a partner's own backend
// auto-provision a brand-new client company (+ its first IT support lead)
// the moment that company signs up on the partner's side — see
// ClientCompanyService.provisionCompany / POST /api/v1/integrations/companies.
// Distinct from client_companies.integration_api_key_hash (ticket creation for
// an EXISTING company) — this one has to live on the project because the
// company doesn't exist yet when the call is made.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddProjectCompanyProvisioningKey1783110000000 implements MigrationInterface {
  name = "AddProjectCompanyProvisioningKey1783110000000";

  async up(q: QueryRunner): Promise<void> {
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

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "idx_projects_company_provisioning_key_hash"`);
    await q.query(`ALTER TABLE "projects" DROP COLUMN IF EXISTS "company_provisioning_key_created_at"`);
    await q.query(`ALTER TABLE "projects" DROP COLUMN IF EXISTS "company_provisioning_key_last_four"`);
    await q.query(`ALTER TABLE "projects" DROP COLUMN IF EXISTS "company_provisioning_key_hash"`);
  }
}
