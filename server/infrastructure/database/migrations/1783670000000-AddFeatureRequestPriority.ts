// Migration: let a project order its feature requests by an explicit work
// priority — 1 first, then 2, 3, 4, ... NULL means no priority set, and those
// requests sort after every prioritized one (see FeatureRequestRepository).
// Duplicate numbers aren't rejected — ties just fall back to the list's normal
// sort (top/newest), same as any other secondary sort key.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddFeatureRequestPriority1783670000000 implements MigrationInterface {
  name = "AddFeatureRequestPriority1783670000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE "feature_requests" ADD COLUMN IF NOT EXISTS "priority" integer
    `);
    await q.query(`
      CREATE INDEX IF NOT EXISTS "idx_feature_requests_project_priority" ON "feature_requests" ("project_id", "priority")
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "idx_feature_requests_project_priority"`);
    await q.query(`ALTER TABLE "feature_requests" DROP COLUMN IF EXISTS "priority"`);
  }
}
