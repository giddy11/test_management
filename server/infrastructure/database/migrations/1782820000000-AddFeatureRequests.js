// Migration: feature_requests + feature_request_votes + feature_request_comments tables.
module.exports = class AddFeatureRequests1782820000000 {
  name = "AddFeatureRequests1782820000000";

  async up(q) {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "feature_requests" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "title" varchar(200) NOT NULL,
        "description" text NOT NULL,
        "status" varchar NOT NULL DEFAULT 'new',
        "category" varchar(50),
        "submitted_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "organization_id" uuid,
        "upvote_count" integer NOT NULL DEFAULT 0,
        "admin_response" text,
        "status_updated_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_feature_requests_status_created" ON "feature_requests" ("status", "created_at")`
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_feature_requests_submitted_by" ON "feature_requests" ("submitted_by_id")`
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_feature_requests_upvote_count" ON "feature_requests" ("upvote_count")`
    );

    await q.query(`
      CREATE TABLE IF NOT EXISTS "feature_request_votes" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "feature_request_id" uuid NOT NULL REFERENCES "feature_requests"("id") ON DELETE CASCADE,
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_feature_request_votes_request_user" ON "feature_request_votes" ("feature_request_id", "user_id")`
    );

    await q.query(`
      CREATE TABLE IF NOT EXISTS "feature_request_comments" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "feature_request_id" uuid NOT NULL REFERENCES "feature_requests"("id") ON DELETE CASCADE,
        "author_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "body" text NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_feature_request_comments_request_created" ON "feature_request_comments" ("feature_request_id", "created_at")`
    );
  }

  async down(q) {
    await q.query(`DROP TABLE IF EXISTS "feature_request_comments"`);
    await q.query(`DROP TABLE IF EXISTS "feature_request_votes"`);
    await q.query(`DROP TABLE IF EXISTS "feature_requests"`);
  }
};
