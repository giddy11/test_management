// Migration: extra seats on top of a plan's included seats.
//
// - organization_subscriptions.extra_seats: how many seats an organisation has
//   bought beyond what its plan includes. They count only while the paid plan
//   is running (worked out on read), so no cleanup is needed when it lapses.
// - subscription_payments.extra_seats: the organisation's total extra seats as
//   of that payment, so the history shows when seats were added.
//
// Safe to re-run: IF NOT EXISTS.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddExtraSeats1783720000000 implements MigrationInterface {
  name = "AddExtraSeats1783720000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "organization_subscriptions" ADD COLUMN IF NOT EXISTS "extra_seats" integer NOT NULL DEFAULT 0`);
    await q.query(`ALTER TABLE "subscription_payments" ADD COLUMN IF NOT EXISTS "extra_seats" integer NOT NULL DEFAULT 0`);
    await q.query(`
      DO $$ BEGIN
        ALTER TABLE "organization_subscriptions"
          ADD CONSTRAINT "chk_organization_subscriptions_extra_seats" CHECK ("extra_seats" >= 0);
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "organization_subscriptions" DROP CONSTRAINT IF EXISTS "chk_organization_subscriptions_extra_seats"`);
    await q.query(`ALTER TABLE "subscription_payments" DROP COLUMN IF EXISTS "extra_seats"`);
    await q.query(`ALTER TABLE "organization_subscriptions" DROP COLUMN IF EXISTS "extra_seats"`);
  }
}
