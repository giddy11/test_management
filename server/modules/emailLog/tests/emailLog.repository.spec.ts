// modules/emailLog/tests/emailLog.repository.spec.ts
// The repository's shaping of query results, with the runner faked.
import { EmailLogRepository } from "../repositories/emailLog.repository";

const row = (id: string) => ({
  id,
  createdAt: new Date("2026-11-23T10:00:00Z"),
  organizationId: null,
  organizationName: null,
  toEmail: "person@company.com",
  subject: "Hello",
  kind: "bug_new",
  status: "sent",
  provider: "gmail",
  fallback: false,
  providerMessageId: null,
  note: null,
});

const runner = () => ({ query: jest.fn() });

describe("EmailLogRepository.list", () => {
  it("returns the rows without the window total, and the total from the first row", async () => {
    const db = runner();
    db.query.mockResolvedValue([
      { ...row("a"), total: 51 },
      { ...row("b"), total: 51 },
    ]);

    const result = await new EmailLogRepository(db).list({}, 1, 25);

    expect(result.total).toBe(51);
    expect(result.rows.map((r) => r.id)).toEqual(["a", "b"]);
    expect(result.rows[0]).not.toHaveProperty("total");
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it("makes ONE query for a first page, even an empty one", async () => {
    const db = runner();
    db.query.mockResolvedValue([]);

    await expect(new EmailLogRepository(db).list({}, 1, 25)).resolves.toEqual({ rows: [], total: 0 });
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it("asks for the real total when a later page comes back empty, so the caller can tell 'too far' from 'no results'", async () => {
    const db = runner();
    db.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: 30 }]);

    const result = await new EmailLogRepository(db).list({ status: "failed" }, 5, 25);

    expect(result).toEqual({ rows: [], total: 30 });
    expect(db.query).toHaveBeenCalledTimes(2);
    expect(db.query.mock.calls[1][0]).toContain("COUNT(*)");
    expect(db.query.mock.calls[1][1]).toEqual(["failed"]);
  });
});

describe("EmailLogRepository.summary", () => {
  it("zero-fills a status that has no rows", async () => {
    const db = runner();
    db.query.mockResolvedValue([{ status: "failed", count: 4 }]);

    await expect(new EmailLogRepository(db).summary({})).resolves.toEqual({ sent: 0, failed: 4, skipped: 0 });
  });

  it("is all zeros for no rows at all", async () => {
    const db = runner();
    db.query.mockResolvedValue([]);

    await expect(new EmailLogRepository(db).summary({})).resolves.toEqual({ sent: 0, failed: 0, skipped: 0 });
  });

  it("ignores a status it does not know rather than inventing a tile", async () => {
    const db = runner();
    db.query.mockResolvedValue([{ status: "bounced", count: 9 }, { status: "sent", count: 2 }]);

    await expect(new EmailLogRepository(db).summary({})).resolves.toEqual({ sent: 2, failed: 0, skipped: 0 });
  });
});

describe("EmailLogRepository.insertMany / purgeOlderThan", () => {
  it("does not touch the database for an empty batch", async () => {
    const db = runner();
    await new EmailLogRepository(db).insertMany([]);
    expect(db.query).not.toHaveBeenCalled();
  });

  it("returns the number of rows the purge deleted", async () => {
    const db = runner();
    db.query.mockResolvedValue([{ count: 17 }]);

    await expect(new EmailLogRepository(db).purgeOlderThan(90)).resolves.toBe(17);
    expect(db.query.mock.calls[0][1]).toEqual([90]);
  });
});
