// Migration: let a project pin up to 10 feature requests so they stay at the
// top of the list regardless of sort. pinned_at is when it was pinned — NULL
// means not pinned, and a non-null value also orders pinned items among
// themselves (most recently pinned first). The 10-item cap is enforced in
// FeatureRequestService, not here.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddFeatureRequestPinning1783670000000 implements MigrationInterface {
  name = "AddFeatureRequestPinning1783670000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE "feature_requests" ADD COLUMN IF NOT EXISTS "pinned_at" timestamptz
    `);
    await q.query(`
      CREATE INDEX IF NOT EXISTS "idx_feature_requests_project_pinned" ON "feature_requests" ("project_id", "pinned_at")
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "idx_feature_requests_project_pinned"`);
    await q.query(`ALTER TABLE "feature_requests" DROP COLUMN IF EXISTS "pinned_at"`);
  }
}
