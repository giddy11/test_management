// Migration: two related changes to the partner integration API.
//
// 1. The integration API key moves from projects to client_companies. IT
//    support queues are already scoped by client_company_id — a project-level
//    key had no way to say which company's queue a partner's tickets belong
//    to, so integration tickets went straight to the product team instead of
//    triage. Issuing the key per company fixes that: createIntegrationTicket
//    now sets client_company_id to the key's owning company.
// 2. feedback.ticket_number — a human-readable sequential id, shown wherever
//    a ticket appears (UI, emails, the integration API response) instead of
//    the raw uuid. Backfilled in creation order for existing rows.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class RouteIntegrationTicketsToSupportAndAddTicketNumber1783090000000
  implements MigrationInterface
{
  name = "RouteIntegrationTicketsToSupportAndAddTicketNumber1783090000000";

  async up(q: QueryRunner): Promise<void> {
    // ── Move the integration key: projects -> client_companies ──────────────
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

    await q.query(`DROP INDEX IF EXISTS "idx_projects_integration_api_key_hash"`);
    await q.query(`ALTER TABLE "projects" DROP COLUMN IF EXISTS "integration_api_key_created_at"`);
    await q.query(`ALTER TABLE "projects" DROP COLUMN IF EXISTS "integration_api_key_last_four"`);
    await q.query(`ALTER TABLE "projects" DROP COLUMN IF EXISTS "integration_api_key_hash"`);

    // Idempotency key for integration ticket creation is now scoped to the
    // owning client company (one partner = one company), not the project —
    // a project can host several partner integrations, each with its own
    // externalRef namespace.
    await q.query(`DROP INDEX IF EXISTS "idx_feedback_project_external_ref"`);
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_feedback_company_external_ref" ON "feedback" ("client_company_id", "external_ref") WHERE "external_ref" IS NOT NULL AND "client_company_id" IS NOT NULL`
    );

    // ── Ticket numbers ────────────────────────────────────────────────────
    await q.query(`CREATE SEQUENCE IF NOT EXISTS "feedback_ticket_number_seq"`);
    await q.query(`ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "ticket_number" integer`);
    await q.query(`
      WITH ordered AS (
        SELECT id, row_number() OVER (ORDER BY created_at) AS rn FROM feedback WHERE ticket_number IS NULL
      )
      UPDATE feedback f SET ticket_number = ordered.rn FROM ordered WHERE f.id = ordered.id
    `);
    await q.query(
      `SELECT setval('feedback_ticket_number_seq', COALESCE((SELECT MAX(ticket_number) FROM feedback), 0) + 1, false)`
    );
    await q.query(
      `ALTER TABLE "feedback" ALTER COLUMN "ticket_number" SET DEFAULT nextval('feedback_ticket_number_seq')`
    );
    await q.query(`ALTER TABLE "feedback" ALTER COLUMN "ticket_number" SET NOT NULL`);
    await q.query(`ALTER SEQUENCE "feedback_ticket_number_seq" OWNED BY "feedback"."ticket_number"`);
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_feedback_ticket_number" ON "feedback" ("ticket_number")`
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "idx_feedback_ticket_number"`);
    await q.query(`ALTER TABLE "feedback" DROP COLUMN IF EXISTS "ticket_number"`);
    await q.query(`DROP SEQUENCE IF EXISTS "feedback_ticket_number_seq"`);

    await q.query(`DROP INDEX IF EXISTS "idx_feedback_company_external_ref"`);
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_feedback_project_external_ref" ON "feedback" ("project_id", "external_ref") WHERE "external_ref" IS NOT NULL`
    );

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

    await q.query(`DROP INDEX IF EXISTS "idx_client_companies_integration_api_key_hash"`);
    await q.query(
      `ALTER TABLE "client_companies" DROP COLUMN IF EXISTS "integration_api_key_created_at"`
    );
    await q.query(
      `ALTER TABLE "client_companies" DROP COLUMN IF EXISTS "integration_api_key_last_four"`
    );
    await q.query(`ALTER TABLE "client_companies" DROP COLUMN IF EXISTS "integration_api_key_hash"`);
  }
}
