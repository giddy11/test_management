// Migration: enforce that a client company's contact email is unique within
// its project (case-insensitive). Guards against races on top of the
// application-layer check in ClientCompanyService.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddClientCompanyEmailUniqueness1783010000000 implements MigrationInterface {
  name = "AddClientCompanyEmailUniqueness1783010000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_client_companies_project_email"
        ON "client_companies" ("project_id", LOWER("contact_email"))
        WHERE "contact_email" IS NOT NULL AND "deleted_at" IS NULL
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "uq_client_companies_project_email"`);
  }
}
