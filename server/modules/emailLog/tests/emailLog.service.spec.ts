// modules/emailLog/tests/emailLog.service.spec.ts
// The log service: recording that never throws, the one-warning rule, paging
// meta, and a retention sweep that can never take the process down.
import { EmailLogService } from "../services/emailLog.service";
import { EmailLogRetentionService } from "../services/emailLogRetention.service";

function fakeRepo() {
  return {
    insertMany: jest.fn().mockResolvedValue(undefined),
    list: jest.fn(),
    summary: jest.fn(),
    purgeOlderThan: jest.fn().mockResolvedValue(0),
  };
}

const input = { to: "person@company.com", subject: "Hello", status: "sent" as const, kind: "bug_new", provider: "gmail" as const };

const isLogWarning = ([message]: unknown[]) => String(message).startsWith("[emailLog]");

describe("EmailLogService.record", () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it("inserts one row per input, built through the privacy rules", async () => {
    const repo = fakeRepo();
    await new EmailLogService(repo).record([
      input,
      { ...input, to: "other@company.com", kind: "verification", subject: "Code 482913" },
    ]);

    expect(repo.insertMany).toHaveBeenCalledTimes(1);
    const rows = repo.insertMany.mock.calls[0][0];
    expect(rows.map((r: any) => r.toEmail)).toEqual(["person@company.com", "other@company.com"]);
    expect(rows[1].subject).toBe("Email verification code");
  });

  it("writes nothing for an empty batch", async () => {
    const repo = fakeRepo();
    await new EmailLogService(repo).record([]);
    expect(repo.insertMany).not.toHaveBeenCalled();
  });

  it("never throws when the insert rejects", async () => {
    const repo = fakeRepo();
    repo.insertMany.mockRejectedValue(new Error("connection terminated"));
    await expect(new EmailLogService(repo).record([input])).resolves.toBeUndefined();
  });

  it("never throws when the insert throws synchronously", async () => {
    const repo = fakeRepo();
    repo.insertMany.mockImplementation(() => {
      throw new Error("pool is gone");
    });
    await expect(new EmailLogService(repo).record([input])).resolves.toBeUndefined();
  });

  it("warns once for a run of failures, not once per email", async () => {
    const repo = fakeRepo();
    repo.insertMany.mockRejectedValue(new Error("connection terminated"));
    const service = new EmailLogService(repo);

    await service.record([input]);
    await service.record([input]);
    await service.record([input]);

    expect(warn.mock.calls.filter(isLogWarning)).toHaveLength(1);
    expect(String(warn.mock.calls[0][1])).toContain("connection terminated");
  });

  it("warns again after a success has cleared the flag", async () => {
    const repo = fakeRepo();
    const service = new EmailLogService(repo);

    repo.insertMany.mockRejectedValueOnce(new Error("first outage"));
    await service.record([input]);
    repo.insertMany.mockResolvedValueOnce(undefined);
    await service.record([input]); // recovered: the flag resets
    repo.insertMany.mockRejectedValueOnce(new Error("second outage"));
    await service.record([input]);

    const warnings = warn.mock.calls.filter(isLogWarning);
    expect(warnings).toHaveLength(2);
    expect(String(warnings[0][1])).toContain("first outage");
    expect(String(warnings[1][1])).toContain("second outage");
  });
});

describe("EmailLogService.list", () => {
  it("returns the page's rows and pagination meta built from the total", async () => {
    const repo = fakeRepo();
    repo.list.mockResolvedValue({ rows: [{ id: "a" }, { id: "b" }], total: 51 });

    const result = await new EmailLogService(repo).list({ status: "failed" }, 2, 25);

    expect(repo.list).toHaveBeenCalledWith({ status: "failed" }, 2, 25);
    expect(result.data).toHaveLength(2);
    expect(result.meta).toEqual({ page: 2, limit: 25, total: 51, totalPages: 3, hasNext: true, hasPrev: true });
  });

  it("reports no next page on the last one", async () => {
    const repo = fakeRepo();
    repo.list.mockResolvedValue({ rows: [{ id: "a" }], total: 26 });

    const { meta } = await new EmailLogService(repo).list({}, 2, 25);

    expect(meta).toMatchObject({ totalPages: 2, hasNext: false, hasPrev: true });
  });
});

describe("EmailLogService.purgeExpired", () => {
  afterEach(() => jest.restoreAllMocks());

  it("deletes past the 90-day retention window by default and reports how many went", async () => {
    const repo = fakeRepo();
    repo.purgeOlderThan.mockResolvedValue(42);

    await expect(new EmailLogService(repo).purgeExpired()).resolves.toBe(42);
    expect(repo.purgeOlderThan).toHaveBeenCalledWith(90);
  });

  it("never throws: a failed purge reports 0 and logs the error", async () => {
    const repo = fakeRepo();
    repo.purgeOlderThan.mockRejectedValue(new Error("deadlock detected"));
    const error = jest.spyOn(console, "error").mockImplementation(() => {});

    await expect(new EmailLogService(repo).purgeExpired()).resolves.toBe(0);
    expect(error).toHaveBeenCalledWith("[emailLog] retention purge failed:", "deadlock detected");
  });
});

describe("EmailLogRetentionService", () => {
  afterEach(() => jest.restoreAllMocks());

  it("sweeps through the log service and returns what it removed", async () => {
    const log = { purgeExpired: jest.fn().mockResolvedValue(3) };
    jest.spyOn(console, "info").mockImplementation(() => {});

    await expect(new EmailLogRetentionService(log).sweep()).resolves.toBe(3);
    expect(log.purgeExpired).toHaveBeenCalledTimes(1);
  });

  it("says nothing when there was nothing to remove", async () => {
    const info = jest.spyOn(console, "info").mockImplementation(() => {});
    await new EmailLogRetentionService({ purgeExpired: jest.fn().mockResolvedValue(0) }).sweep();
    expect(info).not.toHaveBeenCalled();
  });

  it("schedules a repeating sweep once, and a second start() does not stack another", () => {
    jest.useFakeTimers();
    try {
      const log = { purgeExpired: jest.fn().mockResolvedValue(0) };
      const service = new EmailLogRetentionService(log);

      service.start(1000);
      service.start(1000);
      jest.advanceTimersByTime(3000);

      // three interval ticks, and the single boot-time sweep is still ahead (2 minutes)
      expect(log.purgeExpired).toHaveBeenCalledTimes(3);
    } finally {
      jest.useRealTimers();
    }
  });
});
