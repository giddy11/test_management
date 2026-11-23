// modules/emailLog/repositories/emailLog.repository.ts
//
// Runs the email log's SQL. The SQL itself is in domain/emailLogQuery.ts; this
// only executes it and shapes the rows. The runner is injected so a spec (or the
// integration spec, against a throwaway Postgres) can supply its own.
//
// Insert, read and purge only. There is no update: a log row is written once.
import { AppDataSource } from "../../../infrastructure/database/dataSource";
import {
  buildCountQuery,
  buildInsert,
  buildListQuery,
  buildPurge,
  buildSummaryQuery,
  type EmailLogFilters,
  type EmailLogSummaryFilters,
} from "../domain/emailLogQuery";
import { EMAIL_LOG_STATUSES, type EmailLogRow, type EmailLogStatus } from "../domain/emailLogRow";

export interface SqlRunner {
  query(sql: string, params?: unknown[]): Promise<any>;
}

// One row of the list, as the query returns it.
export interface EmailLogListRow {
  id: string;
  createdAt: Date;
  organizationId: string | null;
  organizationName: string | null;
  toEmail: string;
  subject: string;
  kind: string | null;
  status: EmailLogStatus;
  provider: string | null;
  fallback: boolean;
  providerMessageId: string | null;
  note: string | null;
}

export type EmailLogSummary = Record<EmailLogStatus, number>;

export class EmailLogRepository {
  static Instance = new EmailLogRepository();

  constructor(private readonly db: SqlRunner = AppDataSource) {}

  async insertMany(rows: EmailLogRow[]): Promise<void> {
    if (!rows.length) return;
    const { sql, params } = buildInsert(rows);
    await this.db.query(sql, params);
  }

  async list(filters: EmailLogFilters, page: number, limit: number): Promise<{ rows: EmailLogListRow[]; total: number }> {
    const { sql, params } = buildListQuery(filters, page, limit);
    const result: Array<EmailLogListRow & { total: number }> = await this.db.query(sql, params);

    if (result.length) {
      return { rows: result.map(({ total: _total, ...row }) => row), total: result[0].total };
    }
    // COUNT(*) OVER() rides on the page's rows, so a page past the end (the
    // retention job just removed the tail, say) has nowhere to report it. Ask
    // separately, so the caller can tell "no results" from "you went too far".
    if (page > 1) {
      const count = buildCountQuery(filters);
      const [{ count: total }] = await this.db.query(count.sql, count.params);
      return { rows: [], total };
    }
    return { rows: [], total: 0 };
  }

  // Zero-filled: a status with no rows still reports 0.
  async summary(filters: EmailLogSummaryFilters): Promise<EmailLogSummary> {
    const { sql, params } = buildSummaryQuery(filters);
    const result: Array<{ status: EmailLogStatus; count: number }> = await this.db.query(sql, params);
    const summary = Object.fromEntries(EMAIL_LOG_STATUSES.map((s) => [s, 0])) as EmailLogSummary;
    for (const { status, count } of result) {
      if (status in summary) summary[status] = count;
    }
    return summary;
  }

  // How many rows were deleted.
  async purgeOlderThan(days: number): Promise<number> {
    const { sql, params } = buildPurge(days);
    const [{ count }] = await this.db.query(sql, params);
    return Number(count) || 0;
  }
}
