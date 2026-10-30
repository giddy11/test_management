// Migration: work out who made the status moves recorded before actor_id existed.
//
// AddStatusHistoryActor only attributed the initial entry (the reporter / submitter).
// The later moves aren't lost, though: every one of them also wrote an activity_logs
// row — bug.updated / feature_request.status_updated — with the acting user, written
// by the same request a few milliseconds after the history row. So each unattributed
// entry takes the actor of the nearest such log row for the same item, within 30s.
//
// That log row isn't specific to status (bug.updated fires for any edit), which is why
// it is matched by time rather than by id; "nearest within 30s" is what separates the
// status move from an unrelated edit made some minutes earlier or later.
//
//   - Entries with no log row nearby (activity logging failed, or the item predates the
//     audit log) stay NULL — a guess would put a wrong name on the record.
//   - The actor must still exist in users; a removed user stays unattributed.
//   - Already-attributed entries are never touched, so it is safe to re-run.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class BackfillStatusHistoryActor1783660000000 implements MigrationInterface {
  name = "BackfillStatusHistoryActor1783660000000";

  async up(q: QueryRunner): Promise<void> {
    await this.backfill(q, {
      historyTable: "bug_status_history",
      fkColumn: "bug_id",
      entityType: "bug",
      action: "bug.updated",
    });
    await this.backfill(q, {
      historyTable: "feature_request_status_history",
      fkColumn: "feature_request_id",
      entityType: "feature_request",
      action: "feature_request.status_updated",
    });
  }

  private async backfill(
    q: QueryRunner,
    t: { historyTable: string; fkColumn: string; entityType: string; action: string }
  ): Promise<void> {
    await q.query(
      `
      UPDATE "${t.historyTable}" h SET "actor_id" = m."actor_id"
      FROM (
        SELECT DISTINCT ON (h2."id") h2."id", l."actor_id"
        FROM "${t.historyTable}" h2
        JOIN "activity_logs" l
          ON l."entity_type" = $1
         AND l."entity_id" = h2."${t.fkColumn}"
         AND l."action" = $2
         AND l."created_at" BETWEEN h2."entered_at" - interval '30 seconds'
                                AND h2."entered_at" + interval '30 seconds'
        JOIN "users" u ON u."id" = l."actor_id"
        WHERE h2."actor_id" IS NULL
        ORDER BY h2."id", ABS(EXTRACT(EPOCH FROM (l."created_at" - h2."entered_at")))
      ) m
      WHERE h."id" = m."id"
      `,
      [t.entityType, t.action]
    );
  }

  // Backfilled rows can't be told apart from ones recorded live, and clearing
  // the column wholesale would throw away real data — nothing to undo here.
  async down(): Promise<void> {}
}
