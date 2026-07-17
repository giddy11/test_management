// Migration: human-readable reference codes for bugs and feature requests
// ("BF-014", "FR-014"), shown wherever they appear instead of the raw uuid —
// same idea as feedback.ticket_number. Each gets its own sequence-backed
// integer column; the prefix is applied in the application layer (DTOs), not
// stored. Existing rows are backfilled in creation order.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddBugAndFeatureRequestReferenceNumbers1783100000000
  implements MigrationInterface
{
  name = "AddBugAndFeatureRequestReferenceNumbers1783100000000";

  async up(q: QueryRunner): Promise<void> {
    // ── Bugs ──────────────────────────────────────────────────────────────
    await q.query(`CREATE SEQUENCE IF NOT EXISTS "bug_number_seq"`);
    await q.query(`ALTER TABLE "bugs" ADD COLUMN IF NOT EXISTS "bug_number" integer`);
    await q.query(`
      WITH ordered AS (
        SELECT id, row_number() OVER (ORDER BY created_at) AS rn FROM bugs WHERE bug_number IS NULL
      )
      UPDATE bugs b SET bug_number = ordered.rn FROM ordered WHERE b.id = ordered.id
    `);
    await q.query(
      `SELECT setval('bug_number_seq', COALESCE((SELECT MAX(bug_number) FROM bugs), 0) + 1, false)`
    );
    await q.query(
      `ALTER TABLE "bugs" ALTER COLUMN "bug_number" SET DEFAULT nextval('bug_number_seq')`
    );
    await q.query(`ALTER TABLE "bugs" ALTER COLUMN "bug_number" SET NOT NULL`);
    await q.query(`ALTER SEQUENCE "bug_number_seq" OWNED BY "bugs"."bug_number"`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "idx_bugs_bug_number" ON "bugs" ("bug_number")`);

    // ── Feature requests ────────────────────────────────────────────────────
    await q.query(`CREATE SEQUENCE IF NOT EXISTS "feature_request_number_seq"`);
    await q.query(
      `ALTER TABLE "feature_requests" ADD COLUMN IF NOT EXISTS "request_number" integer`
    );
    await q.query(`
      WITH ordered AS (
        SELECT id, row_number() OVER (ORDER BY created_at) AS rn FROM feature_requests WHERE request_number IS NULL
      )
      UPDATE feature_requests f SET request_number = ordered.rn FROM ordered WHERE f.id = ordered.id
    `);
    await q.query(
      `SELECT setval('feature_request_number_seq', COALESCE((SELECT MAX(request_number) FROM feature_requests), 0) + 1, false)`
    );
    await q.query(
      `ALTER TABLE "feature_requests" ALTER COLUMN "request_number" SET DEFAULT nextval('feature_request_number_seq')`
    );
    await q.query(`ALTER TABLE "feature_requests" ALTER COLUMN "request_number" SET NOT NULL`);
    await q.query(
      `ALTER SEQUENCE "feature_request_number_seq" OWNED BY "feature_requests"."request_number"`
    );
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_feature_requests_request_number" ON "feature_requests" ("request_number")`
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "idx_feature_requests_request_number"`);
    await q.query(`ALTER TABLE "feature_requests" DROP COLUMN IF EXISTS "request_number"`);
    await q.query(`DROP SEQUENCE IF EXISTS "feature_request_number_seq"`);

    await q.query(`DROP INDEX IF EXISTS "idx_bugs_bug_number"`);
    await q.query(`ALTER TABLE "bugs" DROP COLUMN IF EXISTS "bug_number"`);
    await q.query(`DROP SEQUENCE IF EXISTS "bug_number_seq"`);
  }
}
