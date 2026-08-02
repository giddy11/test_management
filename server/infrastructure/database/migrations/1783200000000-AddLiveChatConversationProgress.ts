// Migration: expands live-chat conversations from a plain open/closed toggle
// into a staged, visitor-visible progress status (new -> in_progress ->
// resolved -> closed), mirroring feedback's lifecycle. Existing "open" rows
// become "new" (nothing has actually happened on them status-wise yet); the
// "at most one active conversation per visitor" invariant moves from
// status = 'open' to status <> 'closed', since new/in_progress/resolved are
// all still the visitor's current bindable thread — only closed is terminal.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddLiveChatConversationProgress1783200000000 implements MigrationInterface {
  name = "AddLiveChatConversationProgress1783200000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "idx_live_chat_one_open_per_visitor"`);
    await q.query(`UPDATE "live_chat_conversations" SET "status" = 'new' WHERE "status" = 'open'`);
    await q.query(`ALTER TABLE "live_chat_conversations" ALTER COLUMN "status" SET DEFAULT 'new'`);
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_live_chat_active_per_visitor" ON "live_chat_conversations" ("visitor_id") WHERE "status" <> 'closed'`
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "idx_live_chat_active_per_visitor"`);
    await q.query(
      `UPDATE "live_chat_conversations" SET "status" = 'open' WHERE "status" IN ('new', 'in_progress', 'resolved')`
    );
    await q.query(`ALTER TABLE "live_chat_conversations" ALTER COLUMN "status" SET DEFAULT 'open'`);
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_live_chat_one_open_per_visitor" ON "live_chat_conversations" ("visitor_id") WHERE "status" = 'open'`
    );
  }
}
