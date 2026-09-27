// Migration: bugs.comment_count — denormalized counter for the bug's
// conversation thread badge. The comments themselves live in Firestore
// (realtime, collection "bugComments"), same split as feature-request and
// feedback comments — see bugComment.repository.js.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddBugCommentCount1783400000000 implements MigrationInterface {
  name = "AddBugCommentCount1783400000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "bugs" ADD COLUMN IF NOT EXISTS "comment_count" integer NOT NULL DEFAULT 0`
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "bugs" DROP COLUMN IF EXISTS "comment_count"`);
  }
}
