// modules/emailLog/domain/emailLogQuery.ts
//
// The SQL behind the email log, as pure builders: each returns { sql, params }
// and touches no database, so the same text can be asserted on in a unit test
// and run against a real Postgres in the integration spec.
//
// Every value reaches the database as a bound $n parameter. The only things
// concatenated into the text are fixed fragments chosen by the code below,
// never anything that came from a request.
import type { EmailProviderCode } from "../../../shared/utils/mail/emailProviders";
import type { EmailLogRow, EmailLogStatus } from "./emailLogRow";

// "none" in the provider filter means rows with no provider at all.
export const NO_PROVIDER = "none";

export interface EmailLogFilters {
  status?: EmailLogStatus;
  kind?: string;
  provider?: EmailProviderCode | typeof NO_PROVIDER;
  organizationId?: string;
  // Matches the recipient OR the subject, case-insensitively.
  search?: string;
  // Inclusive.
  from?: Date;
  // Exclusive.
  to?: Date;
}

// The summary tiles are the status filter, so the summary ignores it.
export type EmailLogSummaryFilters = Omit<EmailLogFilters, "status">;

export interface BuiltQuery {
  sql: string;
  params: unknown[];
}

// Makes a user's text safe inside a LIKE pattern: %, _ and the escape character
// itself match literally instead of acting as wildcards.
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// The WHERE clause for a filter set. Pushes each value onto `params` and refers
// to it by position.
function where(filters: EmailLogFilters, params: unknown[]): string {
  const conditions: string[] = [];
  const bind = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };

  if (filters.from) conditions.push(`e.created_at >= ${bind(filters.from)}`);
  if (filters.to) conditions.push(`e.created_at < ${bind(filters.to)}`);
  if (filters.status) conditions.push(`e.status = ${bind(filters.status)}`);
  if (filters.kind) conditions.push(`e.kind = ${bind(filters.kind)}`);
  if (filters.provider === NO_PROVIDER) conditions.push("e.provider IS NULL");
  else if (filters.provider) conditions.push(`e.provider = ${bind(filters.provider)}`);
  if (filters.organizationId) conditions.push(`e.organization_id = ${bind(filters.organizationId)}`);
  if (filters.search) {
    const pattern = bind(`%${escapeLike(filters.search)}%`);
    conditions.push(`(e.to_email ILIKE ${pattern} ESCAPE '\\' OR e.subject ILIKE ${pattern} ESCAPE '\\')`);
  }
  return conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
}

// One page, newest first. COUNT(*) OVER() is computed over every matching row
// before LIMIT cuts the page, so the total comes back in the same query. The
// organisation name is looked up for the page's rows only, not for every row
// the filter matched. There is no organisations table: the name is the company
// name of the organisation's first user, the same rule the Organisations page uses.
export function buildListQuery(filters: EmailLogFilters, page: number, limit: number): BuiltQuery {
  const params: unknown[] = [];
  const clause = where(filters, params);
  params.push(limit, (page - 1) * limit);
  const limitParam = `$${params.length - 1}`;
  const offsetParam = `$${params.length}`;
  const sql = `
    WITH page AS (
      SELECT e.id, e.created_at, e.organization_id, e.to_email, e.subject, e.kind, e.status,
             e.provider, e.fallback, e.provider_message_id, e.note,
             COUNT(*) OVER()::int AS total
        FROM email_logs e
        ${clause}
       ORDER BY e.created_at DESC, e.id DESC
       LIMIT ${limitParam} OFFSET ${offsetParam}
    )
    SELECT p.id, p.created_at AS "createdAt", p.organization_id AS "organizationId",
           p.to_email AS "toEmail", p.subject, p.kind, p.status, p.provider, p.fallback,
           p.provider_message_id AS "providerMessageId", p.note,
           org.company_name AS "organizationName", p.total
      FROM page p
      LEFT JOIN LATERAL (
        SELECT u.company_name
          FROM users u
         WHERE u.organization_id = p.organization_id
         ORDER BY u.created_at ASC, u.id ASC
         LIMIT 1
      ) org ON p.organization_id IS NOT NULL
     ORDER BY p.created_at DESC, p.id DESC`;
  return { sql, params };
}

// Only used when a page past the end comes back empty, where COUNT(*) OVER()
// has no row to ride on.
export function buildCountQuery(filters: EmailLogFilters): BuiltQuery {
  const params: unknown[] = [];
  const clause = where(filters, params);
  return { sql: `SELECT COUNT(*)::int AS "count" FROM email_logs e ${clause}`, params };
}

// Counts per status for the tiles. The status filter is dropped on purpose, so
// picking "Failed" does not turn the other two tiles to zero.
export function buildSummaryQuery(filters: EmailLogSummaryFilters): BuiltQuery {
  const params: unknown[] = [];
  const { status: _ignored, ...rest } = filters as EmailLogFilters;
  const clause = where(rest, params);
  return {
    sql: `SELECT e.status, COUNT(*)::int AS "count" FROM email_logs e ${clause} GROUP BY e.status`,
    params,
  };
}

const INSERT_COLUMNS = [
  "organization_id",
  "to_email",
  "subject",
  "kind",
  "status",
  "provider",
  "fallback",
  "provider_message_id",
  "note",
] as const;

// One INSERT for all of an email's recipients.
export function buildInsert(rows: EmailLogRow[]): BuiltQuery {
  const params: unknown[] = [];
  const tuples = rows.map((row) => {
    const values = [
      row.organizationId,
      row.toEmail,
      row.subject,
      row.kind,
      row.status,
      row.provider,
      row.fallback,
      row.providerMessageId,
      row.note,
    ];
    const marks = values.map((v) => {
      params.push(v);
      return `$${params.length}`;
    });
    return `(${marks.join(", ")})`;
  });
  return {
    sql: `INSERT INTO email_logs (${INSERT_COLUMNS.join(", ")}) VALUES ${tuples.join(", ")}`,
    params,
  };
}

// Deletes everything older than the retention window and reports how many rows
// went. One statement, so the count is exactly what was deleted.
export function buildPurge(retentionDays: number): BuiltQuery {
  return {
    sql: `WITH gone AS (
      DELETE FROM email_logs WHERE created_at < now() - ($1::int * interval '1 day') RETURNING 1
    ) SELECT count(*)::int AS "count" FROM gone`,
    params: [retentionDays],
  };
}
