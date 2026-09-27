// Migration: widen notifications_type_enum with 'feedback_mention' — a staff
// member @mentioned another staff member in a ticket's conversation thread
// (see NotificationService.notifyFeedbackMention). The enum can only be
// widened, never narrowed, without rebuilding the type — see down().
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddFeedbackMentionNotificationType1783430000000 implements MigrationInterface {
  name = "AddFeedbackMentionNotificationType1783430000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE "notifications_type_enum" ADD VALUE IF NOT EXISTS 'feedback_mention'`);
  }

  async down(): Promise<void> {}
}
