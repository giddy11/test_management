// Migration: make the activity log a real audit trail.
//
// Three things:
//
//  1. Severity, plus the actor's name and role denormalised onto the row. An
//     audit entry has to keep reading correctly after the person who made it is
//     renamed or removed — that is precisely when somebody goes looking at it.
//
//  2. Indexes for the filter bar. `occurred_at` ordering was already covered;
//     severity and record type were not, and free-text search over the summary
//     and the actor's name needs pg_trgm the same way Global Search does
//     (see AddSearchIndexes) — ILIKE '%term%' cannot use a btree.
//
//  3. Append-only enforcement in the database. The app has no update or delete
//     path for this table, but "the app has no path" is not a guarantee — a
//     stray repository `save()` with an id attached, or a hand-written UPDATE
//     from a migration or a console, would rewrite history silently. A trigger
//     refuses both, for every connection, including the app's own.
//
//     That forces one related change: the actor_id foreign key was ON DELETE
//     SET NULL, and SET NULL is an UPDATE. With the trigger in place it would
//     make deleting a user impossible. The constraint is dropped and actor_id
//     kept as a plain uuid — the denormalised name and role are what the log
//     reads from now, so nothing is lost.
import type { MigrationInterface, QueryRunner } from "typeorm";

const BTREE_INDEXES: [string, string][] = [
  ["idx_activity_org_severity_created", `"organization_id", "severity", "created_at"`],
  ["idx_activity_org_entity_created", `"organization_id", "entity_type", "created_at"`],
  ["idx_activity_org_actor_created", `"organization_id", "actor_id", "created_at"`],
];

// The columns the free-text search matches on.
const TRIGRAM_INDEXES: [string, string][] = [
  ["idx_activity_summary_trgm", "summary"],
  ["idx_activity_actor_name_trgm", "actor_name"],
  ["idx_activity_action_trgm", "action"],
];

export class HardenActivityLog1783380000000 implements MigrationInterface {
  name = "HardenActivityLog1783380000000";

  async up(q: QueryRunner): Promise<void> {
    // ── 1. Columns ───────────────────────────────────────────────────────────
    await q.query(
      `ALTER TABLE "activity_logs" ADD COLUMN IF NOT EXISTS "severity" varchar(10) NOT NULL DEFAULT 'info'`
    );
    await q.query(
      `ALTER TABLE "activity_logs" ADD COLUMN IF NOT EXISTS "actor_name" varchar(160)`
    );
    await q.query(
      `ALTER TABLE "activity_logs" ADD COLUMN IF NOT EXISTS "actor_role" varchar(40)`
    );

    // Backfill from the users table while the actors are still resolvable. This
    // has to happen BEFORE the immutability trigger exists, for obvious reasons.
    await q.query(`
      UPDATE "activity_logs" a
      SET "actor_name" = NULLIF(TRIM(CONCAT_WS(' ', u."first_name", u."last_name")), ''),
          "actor_role" = u."role"
      FROM "users" u
      WHERE u."id" = a."actor_id" AND a."actor_name" IS NULL
    `);
    // Fall back to the email for actors with no name recorded, so a backfilled
    // row never reads as "System" when it had a real person behind it.
    await q.query(`
      UPDATE "activity_logs" a
      SET "actor_name" = u."email"
      FROM "users" u
      WHERE u."id" = a."actor_id" AND a."actor_name" IS NULL
    `);

    // Existing rows predate severity; classify the destructive ones rather than
    // leaving the whole history looking routine. Kept deliberately narrow — it
    // mirrors CRITICAL_ACTIONS / WARNING_ACTIONS in severity.catalog.js.
    await q.query(`
      UPDATE "activity_logs"
      SET "severity" = 'critical'
      WHERE "action" IN (
        'role.created','role.updated','role.permissions_changed','role.deleted',
        'role.assigned','user.deleted','project.deleted','client_company.deleted'
      )
    `);
    await q.query(`
      UPDATE "activity_logs"
      SET "severity" = 'warning'
      WHERE "severity" = 'info' AND (
        "action" LIKE '%.deleted' OR "action" LIKE '%.removed' OR "action" IN (
          'user.created','result.amended','result.bulk_recorded','test_case.imported',
          'test_case.assigned','test_case.unassigned','feedback.escalated',
          'sla.settings_updated','client_company.created',
          'client_company.primary_lead_changed','client_company.supporter_added',
          'client_company.supporter_removed','client_company.supporter_lead_changed'
        )
      )
    `);

    // ── 2. Indexes ───────────────────────────────────────────────────────────
    await q.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    for (const [name, columns] of BTREE_INDEXES) {
      await q.query(
        `CREATE INDEX IF NOT EXISTS "${name}" ON "activity_logs" (${columns})`
      );
    }
    for (const [name, column] of TRIGRAM_INDEXES) {
      await q.query(
        `CREATE INDEX IF NOT EXISTS "${name}" ON "activity_logs" USING gin ("${column}" gin_trgm_ops)`
      );
    }

    // ── 3. Append-only ───────────────────────────────────────────────────────
    // Drop the actor FK first: ON DELETE SET NULL is an UPDATE, which the
    // trigger below would reject, making users undeletable.
    const fks: { conname: string }[] = await q.query(`
      SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      WHERE rel.relname = 'activity_logs' AND con.contype = 'f'
    `);
    for (const { conname } of fks) {
      await q.query(`ALTER TABLE "activity_logs" DROP CONSTRAINT "${conname}"`);
    }

    await q.query(`
      CREATE OR REPLACE FUNCTION "activity_logs_append_only"() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION
          'activity_logs is append-only: % is not permitted', TG_OP
          USING ERRCODE = 'restrict_violation';
      END;
      $$ LANGUAGE plpgsql
    `);
    await q.query(`DROP TRIGGER IF EXISTS "trg_activity_logs_no_write" ON "activity_logs"`);
    await q.query(`
      CREATE TRIGGER "trg_activity_logs_no_write"
      BEFORE UPDATE OR DELETE ON "activity_logs"
      FOR EACH ROW EXECUTE FUNCTION "activity_logs_append_only"()
    `);
    // A row-level trigger never sees a TRUNCATE, so that needs its own.
    await q.query(
      `DROP TRIGGER IF EXISTS "trg_activity_logs_no_truncate" ON "activity_logs"`
    );
    await q.query(`
      CREATE TRIGGER "trg_activity_logs_no_truncate"
      BEFORE TRUNCATE ON "activity_logs"
      FOR EACH STATEMENT EXECUTE FUNCTION "activity_logs_append_only"()
    `);
  }

  // Dropping the triggers first is what makes this reversible at all — without
  // that, dropping the columns would still be fine but any later data fix would
  // not be. The actor foreign key is not restored: the table is append-only by
  // design now, and re-adding ON DELETE SET NULL would reintroduce the conflict.
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TRIGGER IF EXISTS "trg_activity_logs_no_truncate" ON "activity_logs"`);
    await q.query(`DROP TRIGGER IF EXISTS "trg_activity_logs_no_write" ON "activity_logs"`);
    await q.query(`DROP FUNCTION IF EXISTS "activity_logs_append_only"()`);
    for (const [name] of [...BTREE_INDEXES, ...TRIGRAM_INDEXES]) {
      await q.query(`DROP INDEX IF EXISTS "${name}"`);
    }
    await q.query(`ALTER TABLE "activity_logs" DROP COLUMN IF EXISTS "actor_role"`);
    await q.query(`ALTER TABLE "activity_logs" DROP COLUMN IF EXISTS "actor_name"`);
    await q.query(`ALTER TABLE "activity_logs" DROP COLUMN IF EXISTS "severity"`);
  }
}
