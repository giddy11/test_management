// Migration: partner integration API — per-project API key for server-to-server
// ticket creation/lookup (e.g. DOMS), separate from the public browser form
// token. feedback.source distinguishes how a ticket was created; external_ref
// is the partner's own correlation id, used for idempotent creation retries.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddFeedbackIntegrationApi1783070000000 implements MigrationInterface {
  name = "AddFeedbackIntegrationApi1783070000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "integration_api_key_hash" varchar(255)`
    );
    await q.query(
      `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "integration_api_key_last_four" varchar(4)`
    );
    await q.query(
      `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "integration_api_key_created_at" timestamptz`
    );
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_projects_integration_api_key_hash" ON "projects" ("integration_api_key_hash") WHERE "integration_api_key_hash" IS NOT NULL`
    );

    await q.query(
      `ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "source" varchar(20) NOT NULL DEFAULT 'public_form'`
    );
    await q.query(`ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "external_ref" varchar(120)`);
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_feedback_project_external_ref" ON "feedback" ("project_id", "external_ref") WHERE "external_ref" IS NOT NULL`
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "idx_feedback_project_external_ref"`);
    await q.query(`ALTER TABLE "feedback" DROP COLUMN IF EXISTS "external_ref"`);
    await q.query(`ALTER TABLE "feedback" DROP COLUMN IF EXISTS "source"`);
    await q.query(`DROP INDEX IF EXISTS "idx_projects_integration_api_key_hash"`);
    await q.query(`ALTER TABLE "projects" DROP COLUMN IF EXISTS "integration_api_key_created_at"`);
    await q.query(`ALTER TABLE "projects" DROP COLUMN IF EXISTS "integration_api_key_last_four"`);
    await q.query(`ALTER TABLE "projects" DROP COLUMN IF EXISTS "integration_api_key_hash"`);
  }
}
