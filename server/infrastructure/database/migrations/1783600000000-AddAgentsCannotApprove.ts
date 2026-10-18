// Migration: an organisation can keep IT agents out of approvals.
//
//   service_desk_settings  + agents_cannot_approve   off by default. When on, people
//                          who work the IT queue without also setting up IT requests
//                          can't be named as approvers, and are skipped when a request
//                          is routed (separation of duties: the people who fulfil a
//                          request don't also approve it). Administrators and IT
//                          managers stay eligible, so the stand-in always works.
//
// Safe to re-run: IF NOT EXISTS.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddAgentsCannotApprove1783600000000 implements MigrationInterface {
  name = "AddAgentsCannotApprove1783600000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "service_desk_settings" ADD COLUMN IF NOT EXISTS "agents_cannot_approve" boolean NOT NULL DEFAULT false`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "service_desk_settings" DROP COLUMN IF EXISTS "agents_cannot_approve"`);
  }
}
