// Migration: where a ticket came in from (FeedbackChannel) — "web_form" for
// the public form (every existing row), "whatsapp" for tickets logged by a
// WhatsApp widget just before it hands the person off to WhatsApp.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddFeedbackChannel1783490000000 implements MigrationInterface {
  name = "AddFeedbackChannel1783490000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "channel" varchar(20) NOT NULL DEFAULT 'web_form'`
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "feedback" DROP COLUMN IF EXISTS "channel"`);
  }
}
