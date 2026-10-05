// Migration: feature requests can be assigned to a user, same shape as bugs.assignedToId.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddFeatureRequestAssignee1783480000000 implements MigrationInterface {
  name = "AddFeatureRequestAssignee1783480000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "feature_requests" ADD COLUMN IF NOT EXISTS "assigned_to_id" uuid REFERENCES "users"("id") ON DELETE SET NULL`
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_feature_requests_assigned_to" ON "feature_requests" ("assigned_to_id")`
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "idx_feature_requests_assigned_to"`);
    await q.query(`ALTER TABLE "feature_requests" DROP COLUMN IF EXISTS "assigned_to_id"`);
  }
}
