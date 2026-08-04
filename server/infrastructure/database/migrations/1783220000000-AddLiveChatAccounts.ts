// Migration: real, password-based accounts for a project's live-chat widget —
// an opt-in alternative to the anonymous pre-chat form (live_chat_settings.
// require_account). Scoped per project: the same email can hold separate
// accounts on two different projects' widgets, same as everything else in
// this module. A visitor row still owns the conversation history — an
// authenticated visitor just has visitor.account_id pointing back to the
// account that logged into it, resolved once at login/register time.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddLiveChatAccounts1783220000000 implements MigrationInterface {
  name = "AddLiveChatAccounts1783220000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "live_chat_accounts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
        "email" varchar(255) NOT NULL,
        "password" varchar(255) NOT NULL,
        "name" varchar(120) NOT NULL,
        "phone" varchar(30),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "last_login_at" timestamptz,
        CONSTRAINT "pk_live_chat_accounts" PRIMARY KEY ("id")
      )
    `);
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_live_chat_accounts_project_email" ON "live_chat_accounts" ("project_id", "email")`
    );

    await q.query(
      `ALTER TABLE "live_chat_visitors" ADD COLUMN IF NOT EXISTS "account_id" uuid REFERENCES "live_chat_accounts"("id") ON DELETE SET NULL`
    );
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_live_chat_visitors_account" ON "live_chat_visitors" ("account_id") WHERE "account_id" IS NOT NULL`
    );

    await q.query(
      `ALTER TABLE "live_chat_settings" ADD COLUMN IF NOT EXISTS "require_account" boolean NOT NULL DEFAULT false`
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "live_chat_settings" DROP COLUMN IF EXISTS "require_account"`);
    await q.query(`DROP INDEX IF EXISTS "idx_live_chat_visitors_account"`);
    await q.query(`ALTER TABLE "live_chat_visitors" DROP COLUMN IF EXISTS "account_id"`);
    await q.query(`DROP TABLE IF EXISTS "live_chat_accounts"`);
  }
}
