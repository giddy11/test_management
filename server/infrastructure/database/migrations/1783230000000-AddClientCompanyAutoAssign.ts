// Migration: opt-in setting, controlled by a client company's own IT support
// lead, to auto-route incoming tickets to their least-busy supporter instead
// of alerting the whole queue.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddClientCompanyAutoAssign1783230000000 implements MigrationInterface {
  name = "AddClientCompanyAutoAssign1783230000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "client_companies" ADD COLUMN IF NOT EXISTS "auto_assign_enabled" boolean NOT NULL DEFAULT false`
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "client_companies" DROP COLUMN IF EXISTS "auto_assign_enabled"`);
  }
}
