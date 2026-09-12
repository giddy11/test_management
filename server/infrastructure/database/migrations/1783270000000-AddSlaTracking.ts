// Migration: SLA tracking — key ticket timestamps on feedback (first response,
// resolved, closed) plus a per-organisation SLA rules table.
//
// The three timestamps are backfilled from the two stage-history tables so
// existing tickets report correctly from day one. Comment-based first
// responses live in Firestore and can't be backfilled here — those tickets
// fall back to their first stage change, which is at worst a later (never
// earlier) first-response time.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddSlaTracking1783270000000 implements MigrationInterface {
  name = "AddSlaTracking1783270000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "first_response_at" timestamptz`);
    await q.query(`ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "resolved_at" timestamptz`);
    await q.query(`ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "closed_at" timestamptz`);

    // First response = the first time anyone on either tier acted on the
    // ticket (any stage after "logged", on either timeline).
    await q.query(`
      UPDATE "feedback" f SET "first_response_at" = sub.t
      FROM (
        SELECT feedback_id, MIN(entered_at) AS t FROM (
          SELECT feedback_id, entered_at FROM feedback_status_history WHERE status <> 'logged'
          UNION ALL
          SELECT feedback_id, entered_at FROM feedback_support_status_history WHERE status <> 'logged'
        ) h GROUP BY feedback_id
      ) sub
      WHERE sub.feedback_id = f.id AND f."first_response_at" IS NULL
    `);
    // Safety net for rows that moved without a history entry.
    await q.query(`
      UPDATE "feedback" SET "first_response_at" = "status_updated_at"
      WHERE "first_response_at" IS NULL AND "status" <> 'logged' AND "status_updated_at" IS NOT NULL
    `);

    // Resolved = product-tier "resolved" stage, or the IT tier's local
    // resolution — whichever came first.
    await q.query(`
      UPDATE "feedback" f SET "resolved_at" = sub.t
      FROM (
        SELECT feedback_id, MIN(entered_at) AS t FROM feedback_status_history
        WHERE status = 'resolved' GROUP BY feedback_id
      ) sub
      WHERE sub.feedback_id = f.id AND f."resolved_at" IS NULL
    `);
    await q.query(`
      UPDATE "feedback" SET "resolved_at" = "support_resolved_at"
      WHERE "support_resolved_at" IS NOT NULL
        AND ("resolved_at" IS NULL OR "support_resolved_at" < "resolved_at")
    `);
    await q.query(`
      UPDATE "feedback" SET "resolved_at" = "status_updated_at"
      WHERE "resolved_at" IS NULL AND "status" IN ('resolved', 'closed') AND "status_updated_at" IS NOT NULL
    `);

    await q.query(`
      UPDATE "feedback" f SET "closed_at" = sub.t
      FROM (
        SELECT feedback_id, MIN(entered_at) AS t FROM feedback_status_history
        WHERE status = 'closed' GROUP BY feedback_id
      ) sub
      WHERE sub.feedback_id = f.id AND f."closed_at" IS NULL
    `);
    await q.query(`
      UPDATE "feedback" SET "closed_at" = "status_updated_at"
      WHERE "closed_at" IS NULL AND "status" = 'closed' AND "status_updated_at" IS NOT NULL
    `);

    await q.query(`CREATE INDEX IF NOT EXISTS "idx_feedback_created_at" ON "feedback" ("created_at")`);

    // One row per organisation; absent => code defaults (see sla.service.ts).
    await q.query(`
      CREATE TABLE IF NOT EXISTS "sla_settings" (
        "organization_id" uuid PRIMARY KEY,
        "targets" jsonb NOT NULL,
        "paused_statuses" text[] NOT NULL DEFAULT '{}',
        "updated_by_id" uuid,
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "sla_settings"`);
    await q.query(`DROP INDEX IF EXISTS "idx_feedback_created_at"`);
    await q.query(`ALTER TABLE "feedback" DROP COLUMN IF EXISTS "closed_at"`);
    await q.query(`ALTER TABLE "feedback" DROP COLUMN IF EXISTS "resolved_at"`);
    await q.query(`ALTER TABLE "feedback" DROP COLUMN IF EXISTS "first_response_at"`);
  }
}
