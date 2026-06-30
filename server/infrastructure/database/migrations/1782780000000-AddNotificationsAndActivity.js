// Migration: notifications + activity_logs tables.
module.exports = class AddNotificationsAndActivity1782780000000 {
  name = "AddNotificationsAndActivity1782780000000";

  async up(q) {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "notifications" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "type" varchar NOT NULL,
        "title" varchar(255) NOT NULL,
        "body" text,
        "data" jsonb,
        "read_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_notifications_user_created" ON "notifications" ("user_id", "created_at")`
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_notifications_user_read" ON "notifications" ("user_id", "read_at")`
    );

    await q.query(`
      CREATE TABLE IF NOT EXISTS "activity_logs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organization_id" uuid,
        "actor_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "action" varchar(60) NOT NULL,
        "entity_type" varchar(40),
        "entity_id" uuid,
        "summary" text NOT NULL,
        "metadata" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_activity_org_created" ON "activity_logs" ("organization_id", "created_at")`
    );
  }

  async down(q) {
    await q.query(`DROP TABLE IF EXISTS "activity_logs"`);
    await q.query(`DROP TABLE IF EXISTS "notifications"`);
  }
};
