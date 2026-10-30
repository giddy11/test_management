// Migration: record who moved a bug / feature request into each status.
//
// bug_status_history and feature_request_status_history only knew *when* a status
// was entered. actor_id adds *who* — the user whose request caused the move — so the
// status timeline can say "Fixed · by Philip Akpan".
//
// Backfill: the initial entry (Open / new) is always the reporter or submitter, which
// the bug / request row still holds. Later moves are attributed from the audit log by
// BackfillStatusHistoryActor, which runs right after this.
// SET NULL on delete keeps the history when a user is removed.
// Safe to re-run: IF NOT EXISTS throughout.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddStatusHistoryActor1783650000000 implements MigrationInterface {
  name = "AddStatusHistoryActor1783650000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE "bug_status_history"
        ADD COLUMN IF NOT EXISTS "actor_id" uuid REFERENCES "users"("id") ON DELETE SET NULL
    `);
    await q.query(`
      UPDATE "bug_status_history" h SET "actor_id" = b."reported_by_id"
      FROM "bugs" b
      WHERE h."bug_id" = b."id" AND h."actor_id" IS NULL
        AND h."status" = 'Open' AND h."entered_at" = b."created_at"
    `);

    await q.query(`
      ALTER TABLE "feature_request_status_history"
        ADD COLUMN IF NOT EXISTS "actor_id" uuid REFERENCES "users"("id") ON DELETE SET NULL
    `);
    await q.query(`
      UPDATE "feature_request_status_history" h SET "actor_id" = f."submitted_by_id"
      FROM "feature_requests" f
      WHERE h."feature_request_id" = f."id" AND h."actor_id" IS NULL
        AND h."status" = 'new' AND h."entered_at" = f."created_at"
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "feature_request_status_history" DROP COLUMN IF EXISTS "actor_id"`);
    await q.query(`ALTER TABLE "bug_status_history" DROP COLUMN IF EXISTS "actor_id"`);
  }
}
