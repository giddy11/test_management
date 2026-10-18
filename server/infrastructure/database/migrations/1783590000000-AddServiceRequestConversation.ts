// Migration: the conversation on an IT request grows replies, edits, deletes,
// @mentions and files on a message.
//
//   service_request_comments     + parent_id    the root message a reply sits under
//                                               (one level, like bug comments)
//                                + mentions     [{ id, name }] who was @mentioned
//                                + edited_at    set when the author changes the text
//                                + deleted_at / deleted_by_id
//                                               a delete keeps the row as a tombstone,
//                                               so replies stay attached; the text and
//                                               mentions are cleared
//   service_request_attachments  + comment_id   a file sent with a message. NULL means
//                                               the file belongs to the request itself
//
// Safe to re-run: IF NOT EXISTS throughout.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddServiceRequestConversation1783590000000 implements MigrationInterface {
  name = "AddServiceRequestConversation1783590000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE "service_request_comments"
        ADD COLUMN IF NOT EXISTS "parent_id" uuid REFERENCES "service_request_comments"("id") ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS "mentions" jsonb NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS "edited_at" timestamptz,
        ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz,
        ADD COLUMN IF NOT EXISTS "deleted_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_service_request_comments_parent" ON "service_request_comments" ("parent_id") WHERE "parent_id" IS NOT NULL`
    );

    await q.query(`
      ALTER TABLE "service_request_attachments"
        ADD COLUMN IF NOT EXISTS "comment_id" uuid REFERENCES "service_request_comments"("id") ON DELETE CASCADE
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_service_request_attachments_comment" ON "service_request_attachments" ("comment_id") WHERE "comment_id" IS NOT NULL`
    );
  }

  async down(q: QueryRunner): Promise<void> {
    // Files sent with a message have no request-level home to fall back to.
    await q.query(`DELETE FROM "service_request_attachments" WHERE "comment_id" IS NOT NULL`);
    await q.query(`DROP INDEX IF EXISTS "idx_service_request_attachments_comment"`);
    await q.query(`ALTER TABLE "service_request_attachments" DROP COLUMN IF EXISTS "comment_id"`);
    await q.query(`DROP INDEX IF EXISTS "idx_service_request_comments_parent"`);
    await q.query(`
      ALTER TABLE "service_request_comments"
        DROP COLUMN IF EXISTS "deleted_by_id",
        DROP COLUMN IF EXISTS "deleted_at",
        DROP COLUMN IF EXISTS "edited_at",
        DROP COLUMN IF EXISTS "mentions",
        DROP COLUMN IF EXISTS "parent_id"
    `);
  }
}
