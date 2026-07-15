// Migration: a client company's contact email must be unique across the
// whole application, not just within its own project — widens the partial
// unique index added in AddClientCompanyEmailUniqueness.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class MakeClientCompanyEmailGloballyUnique1783020000000
  implements MigrationInterface
{
  name = "MakeClientCompanyEmailGloballyUnique1783020000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "uq_client_companies_project_email"`);
    await q.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_client_companies_email"
        ON "client_companies" (LOWER("contact_email"))
        WHERE "contact_email" IS NOT NULL AND "deleted_at" IS NULL
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "uq_client_companies_email"`);
    await q.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_client_companies_project_email"
        ON "client_companies" ("project_id", LOWER("contact_email"))
        WHERE "contact_email" IS NOT NULL AND "deleted_at" IS NULL
    `);
  }
}
