// Migration: distinguishes one "primary" support lead per client company from
// regular leads. Peer leads can manage each other freely, but only a TestMate
// admin can change the primary lead's status or remove them — see
// ClientCompanyService.setSupporterLead/removeSupporter/setPrimarySupportLead.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddPrimarySupportLead1783140000000 implements MigrationInterface {
  name = "AddPrimarySupportLead1783140000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_primary_support_lead" boolean NOT NULL DEFAULT false`
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "is_primary_support_lead"`);
  }
}
