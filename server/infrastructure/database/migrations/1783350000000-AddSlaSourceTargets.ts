// Migration: separate SLA targets for bugs and feature requests. Until now every
// source was judged against the one set of (ticket) targets. Both columns are
// nullable — null means "follow the ticket targets", so existing organisations
// keep exactly the numbers they have today until an admin sets their own.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddSlaSourceTargets1783350000000 implements MigrationInterface {
  name = "AddSlaSourceTargets1783350000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "sla_settings" ADD COLUMN IF NOT EXISTS "bug_targets" jsonb`);
    await q.query(`ALTER TABLE "sla_settings" ADD COLUMN IF NOT EXISTS "feature_request_target" jsonb`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "sla_settings" DROP COLUMN IF EXISTS "feature_request_target"`);
    await q.query(`ALTER TABLE "sla_settings" DROP COLUMN IF EXISTS "bug_targets"`);
  }
}
