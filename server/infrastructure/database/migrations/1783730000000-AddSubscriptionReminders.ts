// Migration: reminders before a paid plan or trial ends, and when it has.
//
// - subscription_reminders: one row per reminder sent, keyed by organisation,
//   the end date it was about, and which reminder (14 days, 7 days, 1 day,
//   ended). The unique key is how a reminder is claimed before it's sent, so
//   no reminder goes out twice, even with several servers running. Renewing
//   moves the end date, which starts a fresh set.
// - notifications_type_enum gains 'plan_reminder' for the in-app copy.
//
// Safe to re-run: IF NOT EXISTS throughout.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddSubscriptionReminders1783730000000 implements MigrationInterface {
  name = "AddSubscriptionReminders1783730000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "subscription_reminders" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL,
        "ends_at" timestamptz NOT NULL,
        "kind" varchar(10) NOT NULL,
        "sent_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_subscription_reminders" UNIQUE ("organization_id", "ends_at", "kind")
      )
    `);
    await q.query(`ALTER TYPE "notifications_type_enum" ADD VALUE IF NOT EXISTS 'plan_reminder'`);
  }

  async down(q: QueryRunner): Promise<void> {
    // Postgres can't drop a value from an enum; 'plan_reminder' is left in place.
    await q.query(`DROP TABLE IF EXISTS "subscription_reminders"`);
  }
}
