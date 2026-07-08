// Migration: optional module/area label on feature requests.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddFeatureRequestModule1782870000000 implements MigrationInterface {
  name = "AddFeatureRequestModule1782870000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "feature_requests" ADD COLUMN IF NOT EXISTS "module" varchar(100)`
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "feature_requests" DROP COLUMN IF EXISTS "module"`);
  }
}
