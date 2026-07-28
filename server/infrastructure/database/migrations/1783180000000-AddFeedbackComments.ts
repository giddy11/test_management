// Migration: a real back-and-forth comment thread on a ticket — either side
// (staff or the submitter) can post a message, optionally with attachments
// (screenshots or documents). Distinct from the existing single-note fields
// (feedback.admin_response / support_response), which only ever hold the
// latest note tied to a status change. comment_count on feedback is
// denormalized, same pattern as feature_requests.comment_count.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddFeedbackComments1783180000000 implements MigrationInterface {
  name = "AddFeedbackComments1783180000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "feedback_comments" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "feedback_id" uuid NOT NULL REFERENCES "feedback"("id") ON DELETE CASCADE,
        "author_type" varchar(20) NOT NULL,
        "author_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "author_name" varchar(120) NOT NULL,
        "body" text NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_feedback_comments_feedback_id" ON "feedback_comments" ("feedback_id")`
    );

    await q.query(`
      CREATE TABLE IF NOT EXISTS "feedback_comment_attachments" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "comment_id" uuid NOT NULL REFERENCES "feedback_comments"("id") ON DELETE CASCADE,
        "file_name" varchar(255) NOT NULL,
        "file_url" text NOT NULL,
        "file_public_id" varchar(255) NOT NULL,
        "mime_type" varchar(100) NOT NULL,
        "file_size_bytes" integer NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_feedback_comment_attachments_comment_id" ON "feedback_comment_attachments" ("comment_id")`
    );

    await q.query(
      `ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "comment_count" integer NOT NULL DEFAULT 0`
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "feedback_comment_attachments"`);
    await q.query(`DROP TABLE IF EXISTS "feedback_comments"`);
    await q.query(`ALTER TABLE "feedback" DROP COLUMN IF EXISTS "comment_count"`);
  }
}
