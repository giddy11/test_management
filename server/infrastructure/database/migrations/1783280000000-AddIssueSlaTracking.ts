// Migration: extend SLA tracking to Bugs and Feature Requests. Adds a
// per-status-history table for each (mirroring feedback_status_history) plus
// the same first_response_at/resolved_at/closed_at timestamps AddSlaTracking
// added to feedback — so the SLA engine can measure and "pause" against them
// the same way it does tickets.
//
// Bugs already had resolved_at/closed_at (added when bug tracking shipped);
// only first_response_at is new there. Feature requests get all three.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddIssueSlaTracking1783280000000 implements MigrationInterface {
  name = "AddIssueSlaTracking1783280000000";

  async up(q: QueryRunner): Promise<void> {
    // ── Bug status history ────────────────────────────────────────────────
    await q.query(`
      CREATE TABLE IF NOT EXISTS "bug_status_history" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "bug_id" uuid NOT NULL REFERENCES "bugs"("id") ON DELETE CASCADE,
        "status" varchar(30) NOT NULL,
        "entered_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_bug_status_history" PRIMARY KEY ("id")
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_bug_status_history_bug" ON "bug_status_history" ("bug_id", "entered_at")`
    );
    // Backfill: only two points in time are known for existing rows — when
    // they were opened, and when they last changed status.
    await q.query(`
      INSERT INTO "bug_status_history" ("bug_id", "status", "entered_at")
      SELECT "id", 'Open', "created_at" FROM "bugs"
    `);
    await q.query(`
      INSERT INTO "bug_status_history" ("bug_id", "status", "entered_at")
      SELECT "id", "status", COALESCE("status_updated_at", "created_at")
      FROM "bugs" WHERE "status" != 'Open'
    `);

    // ── Feature request status history ──────────────────────────────────
    await q.query(`
      CREATE TABLE IF NOT EXISTS "feature_request_status_history" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "feature_request_id" uuid NOT NULL REFERENCES "feature_requests"("id") ON DELETE CASCADE,
        "status" varchar(30) NOT NULL,
        "entered_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_feature_request_status_history" PRIMARY KEY ("id")
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_feature_request_status_history_fr" ON "feature_request_status_history" ("feature_request_id", "entered_at")`
    );
    await q.query(`
      INSERT INTO "feature_request_status_history" ("feature_request_id", "status", "entered_at")
      SELECT "id", 'new', "created_at" FROM "feature_requests"
    `);
    await q.query(`
      INSERT INTO "feature_request_status_history" ("feature_request_id", "status", "entered_at")
      SELECT "id", "status", COALESCE("status_updated_at", "created_at")
      FROM "feature_requests" WHERE "status" != 'new'
    `);

    // ── New timestamp columns ───────────────────────────────────────────
    await q.query(`ALTER TABLE "bugs" ADD COLUMN IF NOT EXISTS "first_response_at" timestamptz`);
    await q.query(`
      UPDATE "bugs" b SET "first_response_at" = sub.t
      FROM (
        SELECT bug_id, MIN(entered_at) AS t FROM "bug_status_history"
        WHERE status != 'Open' GROUP BY bug_id
      ) sub
      WHERE sub.bug_id = b.id AND b."first_response_at" IS NULL
    `);
    await q.query(`
      UPDATE "bugs" SET "first_response_at" = "status_updated_at"
      WHERE "first_response_at" IS NULL AND "status" != 'Open' AND "status_updated_at" IS NOT NULL
    `);

    await q.query(`ALTER TABLE "feature_requests" ADD COLUMN IF NOT EXISTS "first_response_at" timestamptz`);
    await q.query(`ALTER TABLE "feature_requests" ADD COLUMN IF NOT EXISTS "resolved_at" timestamptz`);
    await q.query(`ALTER TABLE "feature_requests" ADD COLUMN IF NOT EXISTS "closed_at" timestamptz`);
    await q.query(`
      UPDATE "feature_requests" fr SET "first_response_at" = sub.t
      FROM (
        SELECT feature_request_id, MIN(entered_at) AS t FROM "feature_request_status_history"
        WHERE status != 'new' GROUP BY feature_request_id
      ) sub
      WHERE sub.feature_request_id = fr.id AND fr."first_response_at" IS NULL
    `);
    await q.query(`
      UPDATE "feature_requests" SET "first_response_at" = "status_updated_at"
      WHERE "first_response_at" IS NULL AND "status" != 'new' AND "status_updated_at" IS NOT NULL
    `);
    // done/rejected are both terminal — feature requests have no separate
    // "closed" step, so resolved_at and closed_at are backfilled together.
    await q.query(`
      UPDATE "feature_requests"
      SET "resolved_at" = "status_updated_at", "closed_at" = "status_updated_at"
      WHERE "status" IN ('done', 'rejected') AND "status_updated_at" IS NOT NULL
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "feature_requests" DROP COLUMN IF EXISTS "closed_at"`);
    await q.query(`ALTER TABLE "feature_requests" DROP COLUMN IF EXISTS "resolved_at"`);
    await q.query(`ALTER TABLE "feature_requests" DROP COLUMN IF EXISTS "first_response_at"`);
    await q.query(`ALTER TABLE "bugs" DROP COLUMN IF EXISTS "first_response_at"`);
    await q.query(`DROP TABLE IF EXISTS "feature_request_status_history"`);
    await q.query(`DROP TABLE IF EXISTS "bug_status_history"`);
  }
}
