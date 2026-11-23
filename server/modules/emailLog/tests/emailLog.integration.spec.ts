// modules/emailLog/tests/emailLog.integration.spec.ts
//
// The email log against a REAL Postgres: the migration's DDL, recording, every
// filter, the from-inclusive / to-exclusive window, the summary and the purge.
// The unit specs prove the SQL text; this proves what Postgres does with it.
//
// Opt-in. It does nothing unless EMAIL_LOG_TEST_DATABASE_URL is set, so a plain
// `npm test` stays database-free. It will not run against a hosted database:
// any host other than localhost fails the suite outright, on purpose.
//
//   EMAIL_LOG_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/scratch npx jest emailLog.integration
//
// Everything it creates lives in a throwaway schema that is dropped afterwards,
// so even a local database that already has an email_logs table is left alone.
import { EMAIL_LOGS_DDL } from "../../../infrastructure/database/migrations/1783730000000-AddEmailLogs";
import { EmailLogRepository } from "../repositories/emailLog.repository";
import { EmailLogService } from "../services/emailLog.service";

const { Client } = require("pg");
const { randomBytes } = require("crypto");

const URL_ENV = process.env.EMAIL_LOG_TEST_DATABASE_URL;
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1", "[::1]"];

if (URL_ENV && !LOCAL_HOSTS.includes(new URL(URL_ENV).hostname)) {
  throw new Error(
    `Refusing to run the email log integration spec against "${new URL(URL_ENV).hostname}": ` +
      "it only runs against a database on this machine."
  );
}

const suite = URL_ENV ? describe : describe.skip;

const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ORG_NO_NAME = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

suite("email log — against a real Postgres", () => {
  const schema = `email_log_test_${randomBytes(6).toString("hex")}`;
  let client: any;
  let repo: EmailLogRepository;
  let service: EmailLogService;

  const q = async (sql: string, params?: unknown[]) => (await client.query(sql, params)).rows;

  // A row at an exact moment, written directly so the timestamps are ours.
  const insert = (row: Record<string, unknown>) => {
    const r = {
      created_at: "2026-11-15T12:00:00Z",
      organization_id: null,
      to_email: "person@company.com",
      subject: "Hello",
      kind: "bug_new",
      status: "sent",
      provider: "gmail",
      fallback: false,
      provider_message_id: null,
      note: null,
      ...row,
    };
    const cols = Object.keys(r);
    return q(
      `INSERT INTO email_logs (${cols.join(", ")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")})`,
      Object.values(r)
    );
  };
  const ids = (rows: Array<{ toEmail: string }>) => rows.map((r) => r.toEmail);

  beforeAll(async () => {
    client = new Client({ connectionString: URL_ENV });
    await client.connect();
    await q(`CREATE SCHEMA ${schema}`);
    await q(`SET search_path TO ${schema}`);
    // The one outside table the list reads: an organisation's name is its first user's company name.
    await q(`CREATE TABLE users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id uuid, company_name varchar(255),
      created_at timestamptz NOT NULL DEFAULT now())`);
    for (const statement of EMAIL_LOGS_DDL) await q(statement);

    repo = new EmailLogRepository({ query: async (sql, params) => (await client.query(sql, params)).rows });
    service = new EmailLogService(repo);
  });

  afterAll(async () => {
    if (!client) return;
    await q(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await client.end();
  });

  beforeEach(async () => {
    await q(`TRUNCATE email_logs`);
    await q(`TRUNCATE users`);
  });

  describe("the migration", () => {
    it("creates the columns the brief asks for", async () => {
      const columns = await q(
        `SELECT column_name, data_type, character_maximum_length AS len, is_nullable, column_default
           FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'email_logs'`,
        [schema]
      );
      const by = Object.fromEntries(columns.map((c: any) => [c.column_name, c]));
      expect(Object.keys(by).sort()).toEqual(
        ["created_at", "fallback", "id", "kind", "note", "organization_id", "provider", "provider_message_id", "status", "subject", "to_email"].sort()
      );
      expect(by.id.data_type).toBe("uuid");
      expect(by.created_at).toMatchObject({ data_type: "timestamp with time zone", is_nullable: "NO" });
      expect(by.created_at.column_default).toContain("now()");
      expect(by.organization_id).toMatchObject({ data_type: "uuid", is_nullable: "YES" });
      expect(by.to_email).toMatchObject({ len: 255, is_nullable: "NO" });
      expect(by.subject).toMatchObject({ len: 300, is_nullable: "NO" });
      expect(by.kind).toMatchObject({ len: 40, is_nullable: "YES" });
      expect(by.status).toMatchObject({ len: 10, is_nullable: "NO" });
      expect(by.provider).toMatchObject({ len: 30, is_nullable: "YES" });
      expect(by.fallback).toMatchObject({ data_type: "boolean", is_nullable: "NO", column_default: "false" });
      expect(by.provider_message_id).toMatchObject({ len: 150, is_nullable: "YES" });
      expect(by.note).toMatchObject({ len: 600, is_nullable: "YES" });
    });

    it("creates the three indexes, newest-first", async () => {
      const indexes = await q(`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = $1 AND tablename = 'email_logs'`, [schema]);
      const def = (name: string) => indexes.find((i: any) => i.indexname === name)?.indexdef as string;
      expect(def("idx_email_logs_created_at")).toMatch(/\(created_at DESC\)/);
      expect(def("idx_email_logs_status_created_at")).toMatch(/\(status, created_at DESC\)/);
      expect(def("idx_email_logs_provider_created_at")).toMatch(/\(provider, created_at DESC\)/);
    });

    it("refuses a status other than sent, failed or skipped", async () => {
      await expect(insert({ status: "bounced" })).rejects.toThrow(/chk_email_logs_status/);
    });

    it("can be applied twice without error", async () => {
      for (const statement of EMAIL_LOGS_DDL) await q(statement);
    });

    it("has no foreign key on organization_id: there is no organisations table to point at", async () => {
      const fks = await q(`SELECT 1 FROM pg_constraint WHERE conrelid = 'email_logs'::regclass AND contype = 'f'`);
      expect(fks).toEqual([]);
    });
  });

  describe("recording", () => {
    it("writes sent, failed and skipped rows, one per recipient, with the provider on each", async () => {
      await service.record([
        { to: "a@company.com", subject: "S", status: "sent", kind: "bug_new", provider: "gmail", providerMessageId: "<m1>" },
        { to: "b@company.com", subject: "S", status: "failed", kind: "bug_new", provider: "script_relay", note: "Apps Script responded 500" },
        { to: "c@acme.test", subject: "S", status: "skipped", kind: "bug_new", provider: null, note: "Reserved test address" },
        { to: "d@company.com", subject: "S", status: "sent", kind: "bug_new", provider: "script_relay", fallback: true, note: "gmail failed (x); sent through script_relay" },
      ]);

      const rows = await q(`SELECT to_email, status, provider, fallback, provider_message_id, note FROM email_logs ORDER BY to_email`);
      expect(rows).toEqual([
        { to_email: "a@company.com", status: "sent", provider: "gmail", fallback: false, provider_message_id: "<m1>", note: null },
        { to_email: "b@company.com", status: "failed", provider: "script_relay", fallback: false, provider_message_id: null, note: "Apps Script responded 500" },
        { to_email: "c@acme.test", status: "skipped", provider: null, fallback: false, provider_message_id: null, note: "Reserved test address" },
        { to_email: "d@company.com", status: "sent", provider: "script_relay", fallback: true, provider_message_id: null, note: "gmail failed (x); sent through script_relay" },
      ]);
    });

    it("stamps created_at itself", async () => {
      await service.record([{ to: "a@company.com", subject: "S", status: "sent" }]);
      const [{ age }] = await q(`SELECT extract(epoch FROM now() - created_at) AS age FROM email_logs`);
      expect(Number(age)).toBeLessThan(5);
    });

    it("stores a fixed label, not the subject, for a secret-bearing kind", async () => {
      await service.record([{ to: "a@company.com", subject: "Your code is 482913", status: "sent", kind: "verification" }]);
      const [{ subject }] = await q(`SELECT subject FROM email_logs`);
      expect(subject).toBe("Email verification code");
    });

    it("fits oversized values into their columns instead of losing the row", async () => {
      const long = "x".repeat(5000);
      await service.record([{ to: long, subject: long, status: "failed", kind: long, provider: "gmail", note: long, providerMessageId: long }]);
      const [row] = await q(`SELECT length(to_email) a, length(subject) b, length(kind) c, length(provider_message_id) d, length(note) e FROM email_logs`);
      expect(row).toEqual({ a: 255, b: 300, c: 40, d: 150, e: 600 });
    });

    it("survives a database error without throwing", async () => {
      const broken = new EmailLogService(new EmailLogRepository({ query: async () => Promise.reject(new Error("db gone")) }));
      const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
      await expect(broken.record([{ to: "a@company.com", subject: "S", status: "sent" }])).resolves.toBeUndefined();
      warn.mockRestore();
    });
  });

  describe("listing", () => {
    beforeEach(async () => {
      await insert({ to_email: "sent-gmail@company.com", status: "sent", provider: "gmail", kind: "welcome", created_at: "2026-11-15T10:00:00Z" });
      await insert({ to_email: "sent-relay@company.com", status: "sent", provider: "script_relay", kind: "bug_new", created_at: "2026-11-15T11:00:00Z", organization_id: ORG_A });
      await insert({ to_email: "failed-relay@company.com", status: "failed", provider: "script_relay", kind: "bug_new", created_at: "2026-11-15T12:00:00Z", organization_id: ORG_B, note: "Apps Script responded 500" });
      await insert({ to_email: "skipped@acme.test", status: "skipped", provider: null, kind: "feedback_status", created_at: "2026-11-15T13:00:00Z", subject: "Feedback update — 50% off_sale" });
      await insert({ to_email: "fallback@company.com", status: "sent", provider: "script_relay", fallback: true, kind: "welcome", created_at: "2026-11-15T14:00:00Z" });
    });

    const list = async (filters: any = {}, page = 1, limit = 25) => repo.list(filters, page, limit);

    it("returns newest first with the total", async () => {
      const { rows, total } = await list();
      expect(total).toBe(5);
      expect(ids(rows)).toEqual([
        "fallback@company.com",
        "skipped@acme.test",
        "failed-relay@company.com",
        "sent-relay@company.com",
        "sent-gmail@company.com",
      ]);
    });

    it("returns provider, fallback and providerMessageId on every row", async () => {
      const { rows } = await list();
      expect(rows.find((r) => r.toEmail === "fallback@company.com")).toMatchObject({ provider: "script_relay", fallback: true, providerMessageId: null });
      expect(rows.find((r) => r.toEmail === "skipped@acme.test")).toMatchObject({ provider: null, fallback: false });
    });

    it("breaks a tie on created_at by id, descending, so paging is stable", async () => {
      await q(`TRUNCATE email_logs`);
      for (let n = 0; n < 6; n++) await insert({ to_email: `tie${n}@company.com`, created_at: "2026-11-15T12:00:00Z" });
      const expected = (await q(`SELECT id FROM email_logs ORDER BY id DESC`)).map((r: any) => r.id);

      const pageOne = await list({}, 1, 3);
      const pageTwo = await list({}, 2, 3);

      expect([...pageOne.rows, ...pageTwo.rows].map((r) => r.id)).toEqual(expected);
    });

    it("pages, keeping the total on every page", async () => {
      const first = await list({}, 1, 2);
      const second = await list({}, 2, 2);
      const third = await list({}, 3, 2);
      expect([first.rows.length, second.rows.length, third.rows.length]).toEqual([2, 2, 1]);
      expect([first.total, second.total, third.total]).toEqual([5, 5, 5]);
    });

    it("still reports the total for a page past the end", async () => {
      const { rows, total } = await list({}, 9, 2);
      expect(rows).toEqual([]);
      expect(total).toBe(5);
    });

    it("filters by status", async () => {
      expect(ids((await list({ status: "failed" })).rows)).toEqual(["failed-relay@company.com"]);
      expect((await list({ status: "sent" })).total).toBe(3);
    });

    it("filters by kind", async () => {
      expect((await list({ kind: "welcome" })).rows.map((r) => r.toEmail).sort()).toEqual(["fallback@company.com", "sent-gmail@company.com"]);
    });

    it("filters by provider", async () => {
      expect(ids((await list({ provider: "gmail" })).rows)).toEqual(["sent-gmail@company.com"]);
      expect((await list({ provider: "script_relay" })).total).toBe(3);
    });

    it('filters provider = "none" to the rows with no provider', async () => {
      expect(ids((await list({ provider: "none" })).rows)).toEqual(["skipped@acme.test"]);
    });

    it("filters by organisation", async () => {
      expect(ids((await list({ organizationId: ORG_B })).rows)).toEqual(["failed-relay@company.com"]);
    });

    it("searches the recipient, case-insensitively", async () => {
      expect(ids((await list({ search: "FAILED-RELAY" })).rows)).toEqual(["failed-relay@company.com"]);
    });

    it("searches the subject too", async () => {
      expect(ids((await list({ search: "feedback update" })).rows)).toEqual(["skipped@acme.test"]);
    });

    it("treats % and _ in the search as the characters themselves, not wildcards", async () => {
      expect(ids((await list({ search: "50%" })).rows)).toEqual(["skipped@acme.test"]);
      expect(ids((await list({ search: "off_sale" })).rows)).toEqual(["skipped@acme.test"]);
      // an unescaped % would match every row, an unescaped _ any single character
      expect((await list({ search: "%" })).total).toBe(1);
      expect((await list({ search: "off.sale" })).total).toBe(0);
      expect((await list({ search: "offXsale" })).total).toBe(0);
    });

    it("is not fooled by SQL in the search text", async () => {
      expect((await list({ search: "'; DROP TABLE email_logs; --" })).total).toBe(0);
      expect((await list()).total).toBe(5);
    });

    describe("the time window", () => {
      it("includes a row exactly at `from`", async () => {
        const { rows } = await list({ from: new Date("2026-11-15T12:00:00Z") });
        expect(ids(rows)).toContain("failed-relay@company.com");
      });

      it("excludes a row exactly at `to`", async () => {
        const { rows } = await list({ to: new Date("2026-11-15T12:00:00Z") });
        expect(ids(rows)).not.toContain("failed-relay@company.com");
        expect(ids(rows)).toEqual(["sent-relay@company.com", "sent-gmail@company.com"]);
      });

      it("returns [from, to): the lower bound in, the upper bound out", async () => {
        const { rows } = await list({ from: new Date("2026-11-15T11:00:00Z"), to: new Date("2026-11-15T13:00:00Z") });
        expect(ids(rows)).toEqual(["failed-relay@company.com", "sent-relay@company.com"]);
      });

      it("makes consecutive windows tile with no gap and no overlap", async () => {
        const a = await list({ to: new Date("2026-11-15T12:00:00Z") });
        const b = await list({ from: new Date("2026-11-15T12:00:00Z") });
        expect(a.total + b.total).toBe(5);
        expect(ids(a.rows).filter((x) => ids(b.rows).includes(x))).toEqual([]);
      });

      it("honours the offset the browser sent, not the server's time zone", async () => {
        // 13:00+01:00 is 12:00Z
        const { rows } = await list({ from: new Date("2026-11-15T13:00:00+01:00"), to: new Date("2026-11-15T14:00:00+01:00") });
        expect(ids(rows)).toEqual(["failed-relay@company.com"]);
      });
    });

    it("combines filters", async () => {
      const { rows } = await list({ provider: "script_relay", status: "sent", from: new Date("2026-11-15T11:30:00Z") });
      expect(ids(rows)).toEqual(["fallback@company.com"]);
    });

    describe("the organisation name", () => {
      beforeEach(async () => {
        // The first user created is the owner; later ones must not win.
        await q(`INSERT INTO users (organization_id, company_name, created_at) VALUES
          ($1, 'Acme Ltd', '2026-01-01T00:00:00Z'),
          ($1, 'Someone Else', '2026-06-01T00:00:00Z'),
          ($2, 'Birch & Co', '2026-02-01T00:00:00Z')`, [ORG_A, ORG_B]);
      });

      it("is the company name of the organisation's first user, and null with no organisation", async () => {
        const { rows } = await list();
        const by = Object.fromEntries(rows.map((r) => [r.toEmail, r.organizationName]));
        expect(by["sent-relay@company.com"]).toBe("Acme Ltd");
        expect(by["failed-relay@company.com"]).toBe("Birch & Co");
        expect(by["sent-gmail@company.com"]).toBeNull();
      });

      it("is null, not a crash, when the organisation has no users left", async () => {
        await insert({ to_email: "orphan@company.com", organization_id: ORG_NO_NAME, created_at: "2026-11-16T00:00:00Z" });
        const { rows } = await list({ organizationId: ORG_NO_NAME });
        expect(rows[0]).toMatchObject({ toEmail: "orphan@company.com", organizationId: ORG_NO_NAME, organizationName: null });
      });
    });
  });

  describe("the summary", () => {
    beforeEach(async () => {
      await insert({ status: "sent", provider: "gmail", created_at: "2026-11-15T10:00:00Z" });
      await insert({ status: "sent", provider: "gmail", created_at: "2026-11-15T10:30:00Z" });
      await insert({ status: "sent", provider: "script_relay", created_at: "2026-11-15T11:00:00Z" });
      await insert({ status: "failed", provider: "script_relay", created_at: "2026-11-15T12:00:00Z" });
      await insert({ status: "skipped", provider: null, created_at: "2026-11-15T13:00:00Z" });
    });

    it("counts each status", async () => {
      await expect(repo.summary({})).resolves.toEqual({ sent: 3, failed: 1, skipped: 1 });
    });

    it("zero-fills a status with no rows", async () => {
      await expect(repo.summary({ provider: "gmail" })).resolves.toEqual({ sent: 2, failed: 0, skipped: 0 });
      await q(`TRUNCATE email_logs`);
      await expect(repo.summary({})).resolves.toEqual({ sent: 0, failed: 0, skipped: 0 });
    });

    it("ignores the status filter, so picking a tile does not zero the others", async () => {
      await expect(repo.summary({ status: "failed" } as any)).resolves.toEqual({ sent: 3, failed: 1, skipped: 1 });
    });

    it("respects the provider filter, including none", async () => {
      await expect(repo.summary({ provider: "script_relay" })).resolves.toEqual({ sent: 1, failed: 1, skipped: 0 });
      await expect(repo.summary({ provider: "none" })).resolves.toEqual({ sent: 0, failed: 0, skipped: 1 });
    });

    it("uses the same [from, to) window as the list", async () => {
      await expect(repo.summary({ from: new Date("2026-11-15T11:00:00Z"), to: new Date("2026-11-15T13:00:00Z") })).resolves.toEqual({
        sent: 1,
        failed: 1,
        skipped: 0,
      });
    });

    it("always agrees with the list's own total for the same filters", async () => {
      const filters = { provider: "script_relay" as const, from: new Date("2026-11-15T10:45:00Z") };
      const summary = await repo.summary(filters);
      const { total } = await repo.list(filters, 1, 25);
      expect(summary.sent + summary.failed + summary.skipped).toBe(total);
    });
  });

  describe("the purge", () => {
    it("deletes rows older than 90 days, keeps the rest, and reports exactly how many went", async () => {
      await insert({ to_email: "old1@company.com", created_at: new Date(Date.now() - 91 * 86_400_000).toISOString() });
      await insert({ to_email: "old2@company.com", created_at: new Date(Date.now() - 400 * 86_400_000).toISOString() });
      await insert({ to_email: "recent@company.com", created_at: new Date(Date.now() - 89 * 86_400_000).toISOString() });
      await insert({ to_email: "today@company.com", created_at: new Date().toISOString() });

      await expect(service.purgeExpired()).resolves.toBe(2);

      const left = await q(`SELECT to_email FROM email_logs ORDER BY to_email`);
      expect(left.map((r: any) => r.to_email)).toEqual(["recent@company.com", "today@company.com"]);
    });

    it("reports 0 when there is nothing to remove, and again on a second run", async () => {
      await insert({ created_at: new Date(Date.now() - 100 * 86_400_000).toISOString() });
      await expect(service.purgeExpired()).resolves.toBe(1);
      await expect(service.purgeExpired()).resolves.toBe(0);
    });

    it("never throws: a database error is reported as 0", async () => {
      const broken = new EmailLogService(new EmailLogRepository({ query: async () => Promise.reject(new Error("db gone")) }));
      const error = jest.spyOn(console, "error").mockImplementation(() => {});
      await expect(broken.purgeExpired()).resolves.toBe(0);
      error.mockRestore();
    });
  });
});
