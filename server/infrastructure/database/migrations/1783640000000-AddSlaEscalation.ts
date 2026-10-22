// Migration: SLA breach escalation — the same idea as IT-request escalation.
//
//   sla_settings.escalation        { enabled, level2Pct, level3Pct, contactIds }. Off until an
//                                  administrator turns it on, so no organisation starts
//                                  getting breach emails for tickets it has had open for months.
//   sla_settings.escalation_since  when it was last switched on. Only issues created from then
//                                  on escalate — turning it on never fires for the backlog.
//   sla_escalations                one row per escalation sent, so the sweeper never sends the
//                                  same level twice (issue, which target, level).
//
// Also: the sla_escalated notification type.
// Safe to re-run: IF NOT EXISTS throughout.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddSlaEscalation1783640000000 implements MigrationInterface {
  name = "AddSlaEscalation1783640000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE "sla_settings"
        ADD COLUMN IF NOT EXISTS "escalation" jsonb NOT NULL
          DEFAULT '{"enabled":false,"level2Pct":50,"level3Pct":100,"contactIds":[]}'::jsonb,
        ADD COLUMN IF NOT EXISTS "escalation_since" timestamptz
    `);

    await q.query(`
      CREATE TABLE IF NOT EXISTS "sla_escalations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL,
        "source" varchar(20) NOT NULL,
        "issue_id" uuid NOT NULL,
        "metric" varchar(20) NOT NULL,
        "level" int NOT NULL,
        "notified_user_ids" uuid[] NOT NULL DEFAULT '{}',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_sla_escalations_once" UNIQUE ("issue_id", "metric", "level")
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_sla_escalations_org_created" ON "sla_escalations" ("organization_id", "created_at" DESC)`
    );

    await q.query(`ALTER TYPE "notifications_type_enum" ADD VALUE IF NOT EXISTS 'sla_escalated'`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "sla_escalations"`);
    await q.query(`ALTER TABLE "sla_settings" DROP COLUMN IF EXISTS "escalation_since", DROP COLUMN IF EXISTS "escalation"`);
    // A value can't be dropped from a Postgres enum; sla_escalated stays, unused.
  }
}
