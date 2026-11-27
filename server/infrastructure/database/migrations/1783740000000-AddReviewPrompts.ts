// Migration: the review reminder.
//
// - review_prompt_settings: one row (id "global") with the platform owner's
//   switch and interval. No row means on, every 2 hours.
// - review_prompt_states: when each person was last shown the pop-up.
// - partial indexes for "what is waiting on this person", asked every few
//   minutes by every open session.
// - reviewprompt.manage: the platform-only permission that edits the settings.
//   No role is granted it; the super administrator's wildcard covers it.
//
// Safe to re-run: IF NOT EXISTS, and seedCatalog upserts.
import type { MigrationInterface, QueryRunner } from "typeorm";

const { seedCatalog } = require("../../../modules/access/services/accessSeed.service");

export class AddReviewPrompts1783740000000 implements MigrationInterface {
  name = "AddReviewPrompts1783740000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "review_prompt_settings" (
        "id" varchar(20) PRIMARY KEY,
        "enabled" boolean NOT NULL DEFAULT true,
        "interval_hours" integer NOT NULL DEFAULT 2,
        "updated_by" uuid NULL,
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(`
      CREATE TABLE IF NOT EXISTS "review_prompt_states" (
        "user_id" uuid PRIMARY KEY,
        "last_prompted_at" timestamptz NOT NULL
      )
    `);
    await q.query(`
      CREATE INDEX IF NOT EXISTS "idx_bugs_awaiting_review"
        ON "bugs" ("reported_by_id")
        WHERE "status" = 'Fixed' AND "deleted_at" IS NULL
    `);
    await q.query(`
      CREATE INDEX IF NOT EXISTS "idx_feature_requests_awaiting_review"
        ON "feature_requests" ("submitted_by_id")
        WHERE "status" = 'ready_for_review' AND "deleted_at" IS NULL
    `);

    const query = (sql: string, params?: unknown[]) => q.query(sql, params);
    await seedCatalog(query);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DELETE FROM "permissions" WHERE "code" = 'reviewprompt.manage'`);
    await q.query(`DROP INDEX IF EXISTS "idx_feature_requests_awaiting_review"`);
    await q.query(`DROP INDEX IF EXISTS "idx_bugs_awaiting_review"`);
    await q.query(`DROP TABLE IF EXISTS "review_prompt_states"`);
    await q.query(`DROP TABLE IF EXISTS "review_prompt_settings"`);
  }
}
