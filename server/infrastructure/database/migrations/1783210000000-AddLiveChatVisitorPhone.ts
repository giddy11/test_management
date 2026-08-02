// Migration: adds an optional phone number to the pre-chat contact form
// (name/email already existed; phone rounds it out to match the widget's
// contact-capture UI).
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddLiveChatVisitorPhone1783210000000 implements MigrationInterface {
  name = "AddLiveChatVisitorPhone1783210000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "live_chat_visitors" ADD COLUMN IF NOT EXISTS "phone" varchar(30)`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "live_chat_visitors" DROP COLUMN IF EXISTS "phone"`);
  }
}
