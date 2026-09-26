// Migration: trigram indexes for Global Search.
//
// Global Search matches with `ILIKE '%term%'`, which a btree index cannot
// serve — without help every keystroke is a sequential scan of every title in
// the organisation. pg_trgm's GIN indexes are the standard answer: they index
// the three-character shingles of a string, so a substring match becomes an
// index lookup and stays flat as the tables grow.
//
// gin_trgm_ops covers ILIKE because pg_trgm is case-insensitive by design, so
// one index serves both the case-sensitive and case-insensitive forms.
import type { MigrationInterface, QueryRunner } from "typeorm";

// [index name, table, column] — the columns SearchRepository matches on.
const TRIGRAM_INDEXES: [string, string, string][] = [
  ["idx_projects_name_trgm", "projects", "name"],
  ["idx_test_suites_name_trgm", "test_suites", "name"],
  ["idx_test_cases_title_trgm", "test_cases", "title"],
  ["idx_test_cases_external_id_trgm", "test_cases", "external_id"],
  ["idx_test_runs_name_trgm", "test_runs", "name"],
  ["idx_bugs_title_trgm", "bugs", "title"],
  ["idx_feedback_title_trgm", "feedback", "title"],
];

// A reference code resolves to an exact number lookup rather than a substring
// one, so those two want ordinary btree indexes instead.
const NUMBER_INDEXES: [string, string, string][] = [
  ["idx_bugs_bug_number", "bugs", "bug_number"],
  ["idx_feedback_ticket_number", "feedback", "ticket_number"],
];

export class AddSearchIndexes1783370000000 implements MigrationInterface {
  name = "AddSearchIndexes1783370000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    for (const [name, table, column] of TRIGRAM_INDEXES) {
      await q.query(
        `CREATE INDEX IF NOT EXISTS "${name}" ON "${table}" USING gin ("${column}" gin_trgm_ops)`
      );
    }
    for (const [name, table, column] of NUMBER_INDEXES) {
      await q.query(`CREATE INDEX IF NOT EXISTS "${name}" ON "${table}" ("${column}")`);
    }
  }

  // The extension is left in place: dropping it would take any other index
  // built on it with it, and it costs nothing to keep.
  async down(q: QueryRunner): Promise<void> {
    for (const [name] of [...TRIGRAM_INDEXES, ...NUMBER_INDEXES]) {
      await q.query(`DROP INDEX IF EXISTS "${name}"`);
    }
  }
}
