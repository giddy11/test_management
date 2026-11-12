// Migration: let a project order its bugs by an explicit fix order — 1 first,
// then 2, 3, ... NULL means no order set, and those bugs sort after every
// ordered one (see BugRepository). Same mechanism as FeatureRequest.priority
// (AddFeatureRequestPriority) — named differently here because `bugs.priority`
// already means something else (Low/Medium/High/Urgent urgency).
// Duplicate numbers aren't rejected — ties just fall back to the list's normal
// sort (newest first), same as any other secondary sort key.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddBugFixOrder1783690000000 implements MigrationInterface {
  name = "AddBugFixOrder1783690000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE "bugs" ADD COLUMN IF NOT EXISTS "fix_order" integer
    `);
    await q.query(`
      CREATE INDEX IF NOT EXISTS "idx_bugs_project_fix_order" ON "bugs" ("project_id", "fix_order")
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "idx_bugs_project_fix_order"`);
    await q.query(`ALTER TABLE "bugs" DROP COLUMN IF EXISTS "fix_order"`);
  }
}
