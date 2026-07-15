// Migration: scope activity log rows to a client company so IT support can
// see their own company's log without seeing the rest of the organisation's.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddActivityLogClientCompany1783040000000 implements MigrationInterface {
  name = "AddActivityLogClientCompany1783040000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "activity_logs" ADD COLUMN IF NOT EXISTS "client_company_id" uuid`
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_activity_company_created" ON "activity_logs" ("client_company_id", "created_at")`
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "idx_activity_company_created"`);
    await q.query(`ALTER TABLE "activity_logs" DROP COLUMN IF EXISTS "client_company_id"`);
  }
}
