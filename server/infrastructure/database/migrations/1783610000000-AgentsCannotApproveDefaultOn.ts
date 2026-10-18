// Migration: "IT agents can't approve requests" is on by default.
//
// The switch was added off (AddAgentsCannotApprove). Keeping the people who
// fulfil a request from also approving it is the safer starting point, so new
// organisations get it on, and so does every organisation that already has a
// settings row (none could have chosen it deliberately yet). An administrator
// can turn it off under Catalog setup → Approval policies.
//
// Safe to re-run.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AgentsCannotApproveDefaultOn1783610000000 implements MigrationInterface {
  name = "AgentsCannotApproveDefaultOn1783610000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "service_desk_settings" ALTER COLUMN "agents_cannot_approve" SET DEFAULT true`);
    await q.query(`UPDATE "service_desk_settings" SET "agents_cannot_approve" = true WHERE "agents_cannot_approve" = false`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "service_desk_settings" ALTER COLUMN "agents_cannot_approve" SET DEFAULT false`);
  }
}
