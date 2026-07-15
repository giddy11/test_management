// Migration: in-app support chat. Conversations live in Postgres (inbox list,
// unread counts, status); the messages themselves live in Firestore for realtime
// delivery, so there is no messages table here.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddSupportChat1783060000000 implements MigrationInterface {
  name = "AddSupportChat1783060000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "support_chat_conversations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "status" varchar(20) NOT NULL DEFAULT 'open',
        "last_message_at" timestamptz,
        "last_message_preview" varchar(280),
        "last_sender_role" varchar(20),
        "user_unread" integer NOT NULL DEFAULT 0,
        "admin_unread" integer NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_support_chat_conversations" PRIMARY KEY ("id")
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_support_chat_status_last_message" ON "support_chat_conversations" ("status", "last_message_at")`
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_support_chat_user" ON "support_chat_conversations" ("user_id")`
    );
    // At most one OPEN conversation per user — the floater always binds to that one.
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_support_chat_one_open_per_user" ON "support_chat_conversations" ("user_id") WHERE "status" = 'open'`
    );

    // Single-row global config (id is always 'global') — the super admin's
    // on/off switch for the user-facing floater. Seeded enabled.
    await q.query(`
      CREATE TABLE IF NOT EXISTS "support_chat_settings" (
        "id" varchar(20) NOT NULL,
        "enabled" boolean NOT NULL DEFAULT true,
        "updated_by" uuid,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_support_chat_settings" PRIMARY KEY ("id")
      )
    `);
    await q.query(
      `INSERT INTO "support_chat_settings" ("id", "enabled") VALUES ('global', true) ON CONFLICT ("id") DO NOTHING`
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "support_chat_settings"`);
    await q.query(`DROP INDEX IF EXISTS "idx_support_chat_one_open_per_user"`);
    await q.query(`DROP INDEX IF EXISTS "idx_support_chat_user"`);
    await q.query(`DROP INDEX IF EXISTS "idx_support_chat_status_last_message"`);
    await q.query(`DROP TABLE IF EXISTS "support_chat_conversations"`);
  }
}
