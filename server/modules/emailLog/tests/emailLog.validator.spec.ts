// modules/emailLog/tests/emailLog.validator.spec.ts
// What GET /email-logs and /email-logs/summary accept.
import { listEmailLogSchema, summaryEmailLogSchema } from "../validators/emailLog.schema";

const parseList = (query: Record<string, unknown>) => listEmailLogSchema.safeParse({ body: {}, query, params: {} });
const parseSummary = (query: Record<string, unknown>) => summaryEmailLogSchema.safeParse({ body: {}, query, params: {} });

const messages = (result: { success: boolean; error?: any }) =>
  result.success ? [] : result.error.errors.map((e: any) => `${e.path.join(".")}: ${e.message}`);

describe("GET /email-logs query", () => {
  it("defaults to page 1, 25 per page, with no filter", () => {
    const result = parseList({});
    expect(result.success && result.data.query).toEqual({ page: 1, limit: 25 });
  });

  it("coerces page and limit from the query string", () => {
    const result = parseList({ page: "3", limit: "50" });
    expect(result.success && result.data.query).toMatchObject({ page: 3, limit: 50 });
  });

  it.each([{ page: "0" }, { page: "-1" }, { limit: "0" }, { limit: "101" }])("rejects %p", (query) => {
    expect(parseList(query).success).toBe(false);
  });

  it.each(["sent", "failed", "skipped"])("accepts status %s", (status) => {
    expect(parseList({ status }).success).toBe(true);
  });

  it("rejects an unknown status", () => {
    expect(parseList({ status: "bounced" }).success).toBe(false);
  });

  describe("provider", () => {
    it.each(["gmail", "script_relay", "none"])("accepts %s", (provider) => {
      const result = parseList({ provider });
      expect(result.success && result.data.query.provider).toBe(provider);
    });

    it("rejects a provider that is not in the provider union", () => {
      const result = parseList({ provider: "sendgrid" });
      expect(result.success).toBe(false);
      expect(messages(result)[0]).toMatch(/^query\.provider: /);
    });

    it("rejects the wrong case — codes are stable and lowercase", () => {
      expect(parseList({ provider: "Gmail" }).success).toBe(false);
    });
  });

  it("accepts an organisation id only when it is a uuid", () => {
    expect(parseList({ organizationId: "11111111-1111-4111-8111-111111111111" }).success).toBe(true);
    expect(parseList({ organizationId: "not-a-uuid" }).success).toBe(false);
  });

  it("trims the search text and refuses an empty or oversized one", () => {
    const result = parseList({ search: "  ada@company.com  " });
    expect(result.success && result.data.query.search).toBe("ada@company.com");
    expect(parseList({ search: "   " }).success).toBe(false);
    expect(parseList({ search: "x".repeat(121) }).success).toBe(false);
  });

  it("accepts a kind it has never heard of (old rows keep the codes they were written with) but not an oversized one", () => {
    expect(parseList({ kind: "retired_kind" }).success).toBe(true);
    expect(parseList({ kind: "k".repeat(41) }).success).toBe(false);
  });

  describe("from / to", () => {
    it("parses ISO timestamps that carry an offset into instants", () => {
      const result = parseList({ from: "2026-11-23T00:00:00+01:00", to: "2026-11-24T00:00:00Z" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.query.from).toEqual(new Date("2026-11-22T23:00:00Z"));
        expect(result.data.query.to).toEqual(new Date("2026-11-24T00:00:00Z"));
      }
    });

    it("refuses a timestamp with no offset: it would be read in the server's time zone", () => {
      expect(parseList({ from: "2026-11-23T00:00:00" }).success).toBe(false);
    });

    it("refuses a bare date and plain nonsense", () => {
      expect(parseList({ from: "2026-11-23" }).success).toBe(false);
      expect(parseList({ to: "yesterday" }).success).toBe(false);
    });

    it("accepts either end alone", () => {
      expect(parseList({ from: "2026-11-23T00:00:00Z" }).success).toBe(true);
      expect(parseList({ to: "2026-11-23T00:00:00Z" }).success).toBe(true);
    });

    it("rejects from later than to", () => {
      const result = parseList({ from: "2026-11-24T00:00:00Z", to: "2026-11-23T00:00:00Z" });
      expect(result.success).toBe(false);
      expect(messages(result)).toEqual(["query.from: 'from' must be earlier than 'to'"]);
    });

    it("rejects from equal to to — the window [from, to) would be empty", () => {
      expect(parseList({ from: "2026-11-23T00:00:00Z", to: "2026-11-23T00:00:00Z" }).success).toBe(false);
    });

    it("compares instants, not strings: the same moment in two offsets is still equal", () => {
      expect(parseList({ from: "2026-11-23T01:00:00+01:00", to: "2026-11-23T00:00:00Z" }).success).toBe(false);
    });
  });
});

describe("GET /email-logs/summary query", () => {
  it("takes the same filters as the list, minus status and paging", () => {
    const result = parseSummary({
      provider: "none",
      kind: "welcome",
      search: "ada",
      from: "2026-11-23T00:00:00Z",
      to: "2026-11-24T00:00:00Z",
    });
    expect(result.success).toBe(true);
  });

  it("does not know about status: it is the tiles' own filter, so it is dropped", () => {
    const result = parseSummary({ status: "failed" });
    expect(result.success && result.data.query).not.toHaveProperty("status");
  });

  it("validates the provider the same way", () => {
    expect(parseSummary({ provider: "gmail" }).success).toBe(true);
    expect(parseSummary({ provider: "sendgrid" }).success).toBe(false);
  });

  it("rejects from >= to the same way", () => {
    expect(parseSummary({ from: "2026-11-24T00:00:00Z", to: "2026-11-23T00:00:00Z" }).success).toBe(false);
  });
});
