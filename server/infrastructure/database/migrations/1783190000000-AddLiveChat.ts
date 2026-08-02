// Migration: embeddable live-chat widget. projects.live_chat_token enables the
// widget (same on/off + credential model as feedback_token). Visitors and
// conversations live in Postgres (inbox list, unread counts, status, the
// lightweight visitor/CRM record); the messages themselves live in Firestore
// for realtime delivery, so there is no messages table here — see
// AddSupportChat1783060000000 for the same split.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddLiveChat1783190000000 implements MigrationInterface {
  name = "AddLiveChat1783190000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "live_chat_token" uuid`);
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_projects_live_chat_token" ON "projects" ("live_chat_token") WHERE "live_chat_token" IS NOT NULL`
    );

    await q.query(`
      CREATE TABLE IF NOT EXISTS "live_chat_visitors" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
        "name" varchar(120),
        "email" varchar(255),
        "current_url" varchar(2048),
        "referrer" varchar(2048),
        "first_seen_at" timestamptz NOT NULL DEFAULT now(),
        "last_seen_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_live_chat_visitors" PRIMARY KEY ("id")
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_live_chat_visitors_project" ON "live_chat_visitors" ("project_id")`
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_live_chat_visitors_email" ON "live_chat_visitors" ("email")`
    );

    await q.query(`
      CREATE TABLE IF NOT EXISTS "live_chat_conversations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
        "visitor_id" uuid NOT NULL REFERENCES "live_chat_visitors"("id") ON DELETE CASCADE,
        "status" varchar(20) NOT NULL DEFAULT 'open',
        "assigned_agent_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "last_message_at" timestamptz,
        "last_message_preview" varchar(280),
        "last_sender_role" varchar(20),
        "visitor_unread" integer NOT NULL DEFAULT 0,
        "agent_unread" integer NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "closed_at" timestamptz,
        CONSTRAINT "pk_live_chat_conversations" PRIMARY KEY ("id")
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_live_chat_conv_project_status_last_message" ON "live_chat_conversations" ("project_id", "status", "last_message_at")`
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_live_chat_conv_visitor" ON "live_chat_conversations" ("visitor_id")`
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_live_chat_conv_assigned_agent" ON "live_chat_conversations" ("assigned_agent_id")`
    );
    // At most one OPEN conversation per visitor — the widget always binds to that one.
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_live_chat_one_open_per_visitor" ON "live_chat_conversations" ("visitor_id") WHERE "status" = 'open'`
    );

    // Per-project widget presentation config — created lazily, so no seed rows here.
    await q.query(`
      CREATE TABLE IF NOT EXISTS "live_chat_settings" (
        "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
        "display_name" varchar(120),
        "logo_url" varchar(2048),
        "greeting_message" varchar(500),
        "offline_message" varchar(500),
        "brand_color" varchar(20),
        "updated_by" uuid,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_live_chat_settings" PRIMARY KEY ("project_id")
      )
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "live_chat_settings"`);
    await q.query(`DROP INDEX IF EXISTS "idx_live_chat_one_open_per_visitor"`);
    await q.query(`DROP INDEX IF EXISTS "idx_live_chat_conv_assigned_agent"`);
    await q.query(`DROP INDEX IF EXISTS "idx_live_chat_conv_visitor"`);
    await q.query(`DROP INDEX IF EXISTS "idx_live_chat_conv_project_status_last_message"`);
    await q.query(`DROP TABLE IF EXISTS "live_chat_conversations"`);
    await q.query(`DROP INDEX IF EXISTS "idx_live_chat_visitors_email"`);
    await q.query(`DROP INDEX IF EXISTS "idx_live_chat_visitors_project"`);
    await q.query(`DROP TABLE IF EXISTS "live_chat_visitors"`);
    await q.query(`DROP INDEX IF EXISTS "idx_projects_live_chat_token"`);
    await q.query(`ALTER TABLE "projects" DROP COLUMN IF EXISTS "live_chat_token"`);
  }
}
