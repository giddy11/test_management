// Migration: correct bugs' first_response_at.
//
// Until now bug.service treated any request that included a status as a status
// change — even when it resent the bug's current one (the edit form does this
// with every priority/assignee edit). That stamped a first response the moment a
// bug was merely edited, so bugs looked "responded to" when nobody had moved them.
// The service now only counts a real move; this repairs the rows it already
// wrote, using bug_status_history (the source of truth for real moves).
//
//  1. A bug's first response is its first move away from Open — set it to that.
//  2. A bug that is still Open and has never moved has had no response — clear it.
//
// Bugs whose history is missing are left alone rather than guessed at.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class FixBugFirstResponseAt1783360000000 implements MigrationInterface {
  name = "FixBugFirstResponseAt1783360000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      UPDATE "bugs" b SET "first_response_at" = h.t
      FROM (
        SELECT bug_id, MIN(entered_at) AS t FROM "bug_status_history"
        WHERE status <> 'Open' GROUP BY bug_id
      ) h
      WHERE h.bug_id = b.id AND b."first_response_at" IS DISTINCT FROM h.t
    `);
    await q.query(`
      UPDATE "bugs" SET "first_response_at" = NULL
      WHERE "first_response_at" IS NOT NULL
        AND "status" = 'Open'
        AND NOT EXISTS (
          SELECT 1 FROM "bug_status_history" h
          WHERE h.bug_id = "bugs"."id" AND h.status <> 'Open'
        )
    `);
  }

  // The values it overwrote were wrong, and the originals can't be recovered —
  // there is nothing meaningful to restore.
  async down(): Promise<void> {}
}
