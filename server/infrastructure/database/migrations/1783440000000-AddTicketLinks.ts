// Migration: ticket_links — relates one ticket (bug, feature request or feedback
// ticket) to another, so "has this been raised before?" has an answer and a
// recurring problem can be counted.
//
// One polymorphic table rather than a column per ticket table: a link can join
// any two of the three kinds (a bug that a customer also reported as a feedback
// ticket), and ids from different tables cannot carry foreign keys — so the
// service filters out soft-deleted tickets when it reads. The project FK is what
// removes the rows along with the project.
//
// `related` links are stored once, in a canonical direction (the service orders
// the pair), so the pair unique index covers both directions. `duplicate` links
// are directional — source is the repeat, target the original — and a ticket can
// be a repeat of at most one original (partial unique index below), which is what
// keeps "reported N times" from splitting across two originals.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddTicketLinks1783440000000 implements MigrationInterface {
  name = "AddTicketLinks1783440000000";

  async up(q: QueryRunner): Promise<void> {
    // The similar-ticket lookup uses similarity(); already created by
    // AddSearchIndexes, repeated here so this migration stands on its own.
    await q.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

    await q.query(`
      CREATE TABLE IF NOT EXISTS "ticket_links" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
        "source_type" varchar(20) NOT NULL,
        "source_id" uuid NOT NULL,
        "target_type" varchar(20) NOT NULL,
        "target_id" uuid NOT NULL,
        "link_type" varchar(20) NOT NULL,
        "created_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_ticket_links_source_type" CHECK ("source_type" IN ('bug', 'feature_request', 'feedback')),
        CONSTRAINT "chk_ticket_links_target_type" CHECK ("target_type" IN ('bug', 'feature_request', 'feedback')),
        CONSTRAINT "chk_ticket_links_link_type" CHECK ("link_type" IN ('related', 'duplicate')),
        CONSTRAINT "chk_ticket_links_not_self" CHECK (NOT ("source_type" = "target_type" AND "source_id" = "target_id"))
      )
    `);

    // One relationship per ordered pair. Its leading columns also serve
    // "everything this ticket points at".
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_ticket_links_pair" ON "ticket_links" ("source_type", "source_id", "target_type", "target_id")`
    );
    // A ticket is a repeat of at most one original.
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_ticket_links_one_original" ON "ticket_links" ("source_type", "source_id") WHERE "link_type" = 'duplicate'`
    );
    // "Everything pointing at this ticket" — its repeats and inbound related links.
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_ticket_links_target" ON "ticket_links" ("target_type", "target_id")`
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_ticket_links_project" ON "ticket_links" ("project_id")`
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_ticket_links_created_by" ON "ticket_links" ("created_by_id")`
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "ticket_links"`);
  }
}
