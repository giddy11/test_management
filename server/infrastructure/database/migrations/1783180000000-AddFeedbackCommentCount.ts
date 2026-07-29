// Migration: feedback.comment_count — denormalized counter for the ticket
// comment thread badge. The comments themselves live in Firestore (realtime,
// collection "feedbackComments"), same split as feature-request comments —
// see feedbackComment.repository.ts.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddFeedbackCommentCount1783180000000 implements MigrationInterface {
  name = "AddFeedbackCommentCount1783180000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "comment_count" integer NOT NULL DEFAULT 0`
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "feedback" DROP COLUMN IF EXISTS "comment_count"`);
  }
}
