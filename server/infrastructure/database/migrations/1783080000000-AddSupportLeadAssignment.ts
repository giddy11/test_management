// Migration: IT support leads can assign incoming queue items to other
// supporters within their client company.
// 1. users.is_support_lead — marks an it_support account as a lead.
// 2. feedback.assigned_supporter_id — the supporter (a user) an item is
//    routed to, independent of its support_status stage.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddSupportLeadAssignment1783080000000 implements MigrationInterface {
  name = "AddSupportLeadAssignment1783080000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_support_lead" boolean NOT NULL DEFAULT false
    `);

    await q.query(`
      ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "assigned_supporter_id" uuid NULL
    `);
    await q.query(`
      ALTER TABLE "feedback" ADD CONSTRAINT "fk_feedback_assigned_supporter"
        FOREIGN KEY ("assigned_supporter_id") REFERENCES "users"("id") ON DELETE SET NULL
    `);
    await q.query(`
      CREATE INDEX IF NOT EXISTS "idx_feedback_assigned_supporter"
        ON "feedback" ("assigned_supporter_id")
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "idx_feedback_assigned_supporter"`);
    await q.query(`ALTER TABLE "feedback" DROP CONSTRAINT IF EXISTS "fk_feedback_assigned_supporter"`);
    await q.query(`ALTER TABLE "feedback" DROP COLUMN IF EXISTS "assigned_supporter_id"`);
    await q.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "is_support_lead"`);
  }
}
