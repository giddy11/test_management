// Migration: widen notifications_type_enum with 'bug_comment' — a new message
// in a bug's conversation thread (see NotificationService.notifyBugComment).
// The enum can only be widened, never narrowed, without rebuilding the type —
// see down() for why that isn't attempted here.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddBugCommentNotificationType1783410000000 implements MigrationInterface {
  name = "AddBugCommentNotificationType1783410000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE "notifications_type_enum" ADD VALUE IF NOT EXISTS 'bug_comment'`);
  }

  // Postgres has no DROP VALUE for enums — reverting would mean rebuilding the
  // type and every dependent column, which isn't worth it for a value that's
  // simply unused once this migration is reverted.
  async down(): Promise<void> {}
}
