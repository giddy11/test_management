// Migration: the unique constraint on users.email covered soft-deleted rows
// too, so a removed user's (or client company supporter's) email stayed
// permanently unavailable — re-adding an account with that email crashed
// with a DB-level duplicate-key error even though every app-level check
// (findByEmail) correctly treated it as free. Replace the blanket unique
// constraint/index with one scoped to active (not deleted) rows.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class PartialUniqueUserEmail1783250000000 implements MigrationInterface {
  name = "PartialUniqueUserEmail1783250000000";

  async up(q: QueryRunner): Promise<void> {
    // Drop every unique constraint sitting on users.email, whatever it's
    // named — the column-level `unique: true` in the entity generates a
    // deterministic but easy-to-drift name across environments.
    await q.query(`
      DO $$
      DECLARE
        c RECORD;
      BEGIN
        FOR c IN
          SELECT con.conname
          FROM pg_constraint con
          JOIN pg_class rel ON rel.oid = con.conrelid
          JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
          WHERE rel.relname = 'users'
            AND con.contype = 'u'
            AND att.attname = 'email'
        LOOP
          EXECUTE format('ALTER TABLE "users" DROP CONSTRAINT %I', c.conname);
        END LOOP;
      END $$;
    `);
    await q.query(`DROP INDEX IF EXISTS "idx_users_email"`);
    await q.query(`
      CREATE UNIQUE INDEX "idx_users_email" ON "users" ("email") WHERE "deleted_at" IS NULL
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "idx_users_email"`);
    await q.query(`CREATE UNIQUE INDEX "idx_users_email" ON "users" ("email")`);
  }
}
