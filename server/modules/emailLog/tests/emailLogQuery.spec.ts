// modules/emailLog/tests/emailLogQuery.spec.ts
// The SQL the email log runs, checked as text + bound parameters. What the
// database does with it (the boundaries, the wildcards, the counts) is proved
// against a real Postgres in emailLog.integration.spec.ts.
import {
  buildCountQuery,
  buildInsert,
  buildListQuery,
  buildPurge,
  buildSummaryQuery,
  escapeLike,
} from "../domain/emailLogQuery";

const squash = (sql: string) => sql.replace(/\s+/g, " ").trim();

describe("escapeLike", () => {
  it("makes %, _ and the escape character match literally", () => {
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\");
  });

  it("leaves ordinary text alone", () => {
    expect(escapeLike("ada@company.com")).toBe("ada@company.com");
  });
});

describe("buildListQuery", () => {
  it("has no WHERE clause without filters, and pages with LIMIT / OFFSET", () => {
    const { sql, params } = buildListQuery({}, 3, 25);
    expect(squash(sql)).not.toMatch(/WHERE e\./);
    expect(params).toEqual([25, 50]);
  });

  it("orders newest first with the id as a stable tie-break", () => {
    const { sql } = buildListQuery({}, 1, 25);
    expect(squash(sql)).toContain("ORDER BY e.created_at DESC, e.id DESC");
    expect(squash(sql)).toContain("ORDER BY p.created_at DESC, p.id DESC");
  });

  it("takes the total from COUNT(*) OVER() in the same query", () => {
    const { sql } = buildListQuery({}, 1, 25);
    expect(squash(sql)).toContain("COUNT(*) OVER()::int AS total");
    expect(squash(sql)).toContain('p.total');
  });

  it("includes provider, fallback and providerMessageId on every row, and the tenant name", () => {
    const { sql } = buildListQuery({}, 1, 25);
    for (const column of ["p.provider", "p.fallback", 'AS "providerMessageId"', 'AS "organizationName"']) {
      expect(sql).toContain(column);
    }
  });

  it("makes `from` inclusive and `to` exclusive", () => {
    const from = new Date("2026-11-23T00:00:00Z");
    const to = new Date("2026-11-24T00:00:00Z");
    const { sql, params } = buildListQuery({ from, to }, 1, 25);
    expect(squash(sql)).toContain("e.created_at >= $1 AND e.created_at < $2");
    expect(params.slice(0, 2)).toEqual([from, to]);
  });

  it("filters by status, kind and organisation with bound parameters", () => {
    const { sql, params } = buildListQuery(
      { status: "failed", kind: "bug_new", organizationId: "11111111-1111-1111-1111-111111111111" },
      1,
      10
    );
    expect(squash(sql)).toContain("e.status = $1 AND e.kind = $2 AND e.organization_id = $3");
    expect(params).toEqual(["failed", "bug_new", "11111111-1111-1111-1111-111111111111", 10, 0]);
  });

  it("filters by a provider code with a bound parameter", () => {
    const { sql, params } = buildListQuery({ provider: "script_relay" }, 1, 10);
    expect(squash(sql)).toContain("e.provider = $1");
    expect(params[0]).toBe("script_relay");
  });

  it('treats provider = "none" as rows with no provider, binding nothing', () => {
    const { sql, params } = buildListQuery({ provider: "none" }, 1, 10);
    expect(squash(sql)).toContain("e.provider IS NULL");
    expect(squash(sql)).not.toContain("e.provider =");
    expect(params).toEqual([10, 0]);
  });

  it("matches the search text against the recipient OR the subject, case-insensitively, with wildcards escaped", () => {
    const { sql, params } = buildListQuery({ search: "100%_sure" }, 1, 10);
    expect(squash(sql)).toContain("(e.to_email ILIKE $1 ESCAPE '\\' OR e.subject ILIKE $1 ESCAPE '\\')");
    expect(params[0]).toBe("%100\\%\\_sure%");
  });

  it("never puts a user-supplied value into the SQL text", () => {
    const evil = "'; DROP TABLE email_logs; --";
    const { sql, params } = buildListQuery({ search: evil, kind: evil, organizationId: evil }, 1, 10);
    expect(sql).not.toContain("DROP TABLE");
    expect(sql).not.toContain(evil);
    expect(params).toContain(evil);
  });

  it("combines every filter with AND and numbers the parameters in order", () => {
    const from = new Date("2026-11-01T00:00:00Z");
    const to = new Date("2026-12-01T00:00:00Z");
    const { sql, params } = buildListQuery(
      { from, to, status: "sent", kind: "welcome", provider: "gmail", organizationId: "org", search: "ada" },
      2,
      20
    );
    expect(squash(sql)).toContain(
      "WHERE e.created_at >= $1 AND e.created_at < $2 AND e.status = $3 AND e.kind = $4 AND e.provider = $5 AND e.organization_id = $6 AND (e.to_email ILIKE $7"
    );
    expect(params).toEqual([from, to, "sent", "welcome", "gmail", "org", "%ada%", 20, 20]);
    expect(squash(sql)).toContain("LIMIT $8 OFFSET $9");
  });
});

describe("buildSummaryQuery", () => {
  it("counts per status and leaves the status filter out", () => {
    const { sql, params } = buildSummaryQuery({ status: "failed", kind: "bug_new" } as any);
    expect(squash(sql)).toContain("GROUP BY e.status");
    expect(squash(sql)).not.toContain("e.status =");
    expect(squash(sql)).toContain("e.kind = $1");
    expect(params).toEqual(["bug_new"]);
  });

  it("respects the provider filter, including none", () => {
    expect(squash(buildSummaryQuery({ provider: "gmail" }).sql)).toContain("e.provider = $1");
    expect(squash(buildSummaryQuery({ provider: "none" }).sql)).toContain("e.provider IS NULL");
  });

  it("uses the same inclusive-from / exclusive-to window as the list", () => {
    const from = new Date("2026-11-23T00:00:00Z");
    const to = new Date("2026-11-24T00:00:00Z");
    const { sql } = buildSummaryQuery({ from, to });
    expect(squash(sql)).toContain("e.created_at >= $1 AND e.created_at < $2");
  });
});

describe("buildCountQuery", () => {
  it("counts under the same filters", () => {
    const { sql, params } = buildCountQuery({ status: "sent", provider: "none" });
    expect(squash(sql)).toContain("WHERE e.status = $1 AND e.provider IS NULL");
    expect(params).toEqual(["sent"]);
  });
});

describe("buildInsert", () => {
  const row = (n: number) => ({
    organizationId: null,
    toEmail: `p${n}@company.com`,
    subject: "s",
    kind: "bug_new",
    status: "sent" as const,
    provider: "gmail",
    fallback: false,
    providerMessageId: null,
    note: null,
  });

  it("inserts every recipient in one statement with one placeholder per value", () => {
    const { sql, params } = buildInsert([row(1), row(2)]);
    expect(squash(sql)).toContain(
      "INSERT INTO email_logs (organization_id, to_email, subject, kind, status, provider, fallback, provider_message_id, note) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9), ($10, $11, $12, $13, $14, $15, $16, $17, $18)"
    );
    expect(params).toHaveLength(18);
    expect(params[1]).toBe("p1@company.com");
    expect(params[10]).toBe("p2@company.com");
  });
});

describe("buildPurge", () => {
  it("deletes in a CTE and counts what it deleted, so the count is reliable", () => {
    const { sql, params } = buildPurge(90);
    expect(squash(sql)).toContain("WITH gone AS ( DELETE FROM email_logs WHERE created_at < now() - ($1::int * interval '1 day') RETURNING 1 )");
    expect(squash(sql)).toContain('SELECT count(*)::int AS "count" FROM gone');
    expect(params).toEqual([90]);
  });
});
