// Migration: bugs + bug_attachments tables.
module.exports = class AddBugs1782840000000 {
  name = "AddBugs1782840000000";

  async up(q) {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "bugs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
        "title" varchar(200) NOT NULL,
        "description" text NOT NULL,
        "steps_to_reproduce" text[],
        "expected_behavior" text,
        "actual_behavior" text,
        "environment" varchar(255),
        "severity" varchar NOT NULL DEFAULT 'Minor',
        "priority" varchar NOT NULL DEFAULT 'Medium',
        "status" varchar NOT NULL DEFAULT 'Open',
        "test_case_id" uuid REFERENCES "test_cases"("id") ON DELETE SET NULL,
        "test_run_id" uuid REFERENCES "test_runs"("id") ON DELETE SET NULL,
        "reported_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "assigned_to_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "resolved_at" timestamptz,
        "closed_at" timestamptz,
        "status_updated_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_bugs_project_status_created" ON "bugs" ("project_id", "status", "created_at")`
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_bugs_assigned_to" ON "bugs" ("assigned_to_id")`
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_bugs_reported_by" ON "bugs" ("reported_by_id")`
    );
    await q.query(`CREATE INDEX IF NOT EXISTS "idx_bugs_test_case" ON "bugs" ("test_case_id")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "idx_bugs_test_run" ON "bugs" ("test_run_id")`);

    await q.query(`
      CREATE TABLE IF NOT EXISTS "bug_attachments" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "bug_id" uuid NOT NULL REFERENCES "bugs"("id") ON DELETE CASCADE,
        "file_name" varchar(255) NOT NULL,
        "file_url" text NOT NULL,
        "file_public_id" varchar(255),
        "mime_type" varchar(100) NOT NULL,
        "file_size_bytes" integer NOT NULL,
        "uploaded_by_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_bug_attachments_bug_id" ON "bug_attachments" ("bug_id")`
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_bug_attachments_uploaded_by_id" ON "bug_attachments" ("uploaded_by_id")`
    );
  }

  async down(q) {
    await q.query(`DROP TABLE IF EXISTS "bug_attachments"`);
    await q.query(`DROP TABLE IF EXISTS "bugs"`);
  }
};
