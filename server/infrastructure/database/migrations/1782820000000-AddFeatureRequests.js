// Migration: feature_requests + feature_request_votes tables.
// Comments live in Firestore (realtime), not Postgres — see FeatureRequestCommentRepository.
module.exports = class AddFeatureRequests1782820000000 {
  name = "AddFeatureRequests1782820000000";

  async up(q) {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "feature_requests" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
        "title" varchar(200) NOT NULL,
        "description" text NOT NULL,
        "status" varchar NOT NULL DEFAULT 'new',
        "category" varchar(50),
        "submitted_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "upvote_count" integer NOT NULL DEFAULT 0,
        "comment_count" integer NOT NULL DEFAULT 0,
        "admin_response" text,
        "status_updated_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_feature_requests_project_status_created" ON "feature_requests" ("project_id", "status", "created_at")`
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_feature_requests_submitted_by" ON "feature_requests" ("submitted_by_id")`
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_feature_requests_project_upvote_count" ON "feature_requests" ("project_id", "upvote_count")`
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
  }

  async down(q) {
    await q.query(`DROP TABLE IF EXISTS "feature_request_votes"`);
    await q.query(`DROP TABLE IF EXISTS "feature_requests"`);
  }
};
