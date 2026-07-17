// Migration: removes the partner integration API for tickets entirely (the
// per-company API key, and the feedback columns that only existed to support
// it). Written as a new migration rather than editing
// 1783070000000-AddFeedbackIntegrationApi.ts / 1783090000000-...TicketNumber
// in place, since those may already have run in some environment — every
// statement here is IF EXISTS-guarded so it's a safe no-op if they never did.
//
// feedback.ticket_number is untouched — it's used everywhere a ticket is
// shown (UI, emails), not just by the integration API, so it stays.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class DropPartnerIntegrationTicketApi1783130000000 implements MigrationInterface {
  name = "DropPartnerIntegrationTicketApi1783130000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "idx_feedback_company_external_ref"`);
    await q.query(`ALTER TABLE "feedback" DROP COLUMN IF EXISTS "external_ref"`);
    await q.query(`ALTER TABLE "feedback" DROP COLUMN IF EXISTS "source"`);

    await q.query(`DROP INDEX IF EXISTS "idx_client_companies_integration_api_key_hash"`);
    await q.query(
      `ALTER TABLE "client_companies" DROP COLUMN IF EXISTS "integration_api_key_created_at"`
    );
    await q.query(
      `ALTER TABLE "client_companies" DROP COLUMN IF EXISTS "integration_api_key_last_four"`
    );
    await q.query(`ALTER TABLE "client_companies" DROP COLUMN IF EXISTS "integration_api_key_hash"`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "client_companies" ADD COLUMN IF NOT EXISTS "integration_api_key_hash" varchar(255)`
    );
    await q.query(
      `ALTER TABLE "client_companies" ADD COLUMN IF NOT EXISTS "integration_api_key_last_four" varchar(4)`
    );
    await q.query(
      `ALTER TABLE "client_companies" ADD COLUMN IF NOT EXISTS "integration_api_key_created_at" timestamptz`
    );
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_client_companies_integration_api_key_hash" ON "client_companies" ("integration_api_key_hash") WHERE "integration_api_key_hash" IS NOT NULL`
    );

    await q.query(
      `ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "source" varchar(20) NOT NULL DEFAULT 'public_form'`
    );
    await q.query(`ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "external_ref" varchar(120)`);
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_feedback_company_external_ref" ON "feedback" ("client_company_id", "external_ref") WHERE "external_ref" IS NOT NULL AND "client_company_id" IS NOT NULL`
    );
  }
}
