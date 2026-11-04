// Migration: widen feature_requests_status_enum with 'ready_for_review' — the
// new stage between In Progress and Done (see FeatureRequestService).
//
// The entity declares feature_requests.status as `type: "enum"`, so even
// though the original migration created the column as plain varchar, Postgres
// ended up with a real native enum type here (confirmed against the live DB —
// likely from an early `synchronize` run, back when it defaulted on). Adding
// a value to the JS constants alone isn't enough; the native type has to be
// widened too, or any write/filter using the new value fails at the DB layer.
//
// The enum can only be widened, never narrowed, without rebuilding the type —
// see down() for why that isn't attempted here.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddReadyForReviewStatus1783680000000 implements MigrationInterface {
  name = "AddReadyForReviewStatus1783680000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE "feature_requests_status_enum" ADD VALUE IF NOT EXISTS 'ready_for_review'`);
  }

  async down(): Promise<void> {}
}
