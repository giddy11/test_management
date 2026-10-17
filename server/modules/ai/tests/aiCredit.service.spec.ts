// modules/ai/tests/aiCredit.service.spec.ts
// AiCreditService against an in-memory repository whose applyDelta enforces
// the same rule as the SQL ("never below zero, or nothing happens"). The
// service must rely on that guard alone — never read-then-write — which is
// what makes parallel charges safe. The SQL itself needs a real database to
// exercise; unwrapRows (the pg result shape) is covered here.
import { AiCreditService } from "../services/aiCredit.service";
import { unwrapRows, type CreditMove } from "../repositories/aiCredit.repository";
import { AiRequestError } from "../domain/aiErrors";
import { credits, isMetered, priceOf } from "../domain/credits";

const { actorFor } = require("../../../test/actors");

const admin = actorFor("admin", { id: "admin-1", organizationId: "org-1" });
const user = actorFor("user", { id: "user-1", organizationId: "org-1" });

function memoryRepo(initial: Record<string, number> = {}, prices: Record<string, number> = {}) {
  const balances = new Map(Object.entries(initial));
  const ledger: (CreditMove & { balanceAfter: number; hidden?: boolean })[] = [];
  const audits: unknown[] = [];
  return {
    balances,
    ledger,
    audits,
    prices: { ...prices },
    members: new Set(["user-1", "admin-1"]),
    async applyDelta(move: CreditMove, audit: unknown = null) {
      // Yield first, so parallel callers genuinely interleave.
      await Promise.resolve();
      const next = (balances.get(move.userId) ?? 0) + move.delta;
      if (next < 0) return null;
      balances.set(move.userId, next);
      ledger.push({ ...move, balanceAfter: next });
      if (audit) audits.push(audit);
      return next;
    },
    async balanceOf(userId: string) {
      return balances.get(userId) ?? 0;
    },
    async findPrices() {
      return this.prices;
    },
    async savePrices(_org: string, p: Record<string, number>, _by: string, audit: unknown) {
      this.prices = p;
      audits.push(audit);
      return p;
    },
    async isMemberOf(userId: string) {
      return this.members.has(userId);
    },
    async history(userId: string) {
      const rows = ledger.filter((l) => l.userId === userId && !l.hidden);
      return { rows, total: rows.length };
    },
    async hideHistory(userId: string, dryRun: boolean) {
      const rows = ledger.filter((l) => l.userId === userId && !l.hidden);
      if (!dryRun) rows.forEach((r) => (r.hidden = true));
      return rows.length;
    },
    async listAccounts() {
      return { rows: [], total: 0 };
    },
  };
}

function setup(initial: Record<string, number> = {}, prices: Record<string, number> = {}) {
  const repo = memoryRepo(initial, prices);
  const activity = { buildEntry: jest.fn((_a: unknown, o: object) => ({ ...o })) };
  return { repo, activity, service: new AiCreditService(repo as any, activity) };
}

describe("AiCreditService.charge", () => {
  it("charges nothing for an unpriced feature", async () => {
    const { service, repo } = setup({ "user-1": 5 });
    expect(await service.charge(user, "feature_request_draft", {})).toBeNull();
    expect(repo.ledger).toHaveLength(0);
  });

  it("takes the price and records a usage row", async () => {
    const { service, repo } = setup({ "user-1": 5 }, { feature_request_draft: 2 });
    const charge = await service.charge(user, "feature_request_draft", { projectId: "p-1" });
    expect(charge?.amount).toBe(2);
    expect(repo.balances.get("user-1")).toBe(3);
    expect(repo.ledger[0]).toMatchObject({ type: "usage", delta: -2, feature: "feature_request_draft", projectId: "p-1", balanceAfter: 3 });
  });

  it("refuses with 402 no_credits when the balance can't cover it", async () => {
    const { service, repo } = setup({ "user-1": 1 }, { feature_request_draft: 2 });
    const err = await service.charge(user, "feature_request_draft", {}).catch((e) => e);
    expect(err).toBeInstanceOf(AiRequestError);
    expect(err).toMatchObject({ statusCode: 402, reason: "no_credits" });
    expect(repo.balances.get("user-1")).toBe(1);
    expect(repo.ledger).toHaveLength(0);
  });

  it("treats a user who never had credits as having none", async () => {
    const { service } = setup({}, { feature_request_draft: 1 });
    await expect(service.charge(user, "feature_request_draft", {})).rejects.toMatchObject({ reason: "no_credits" });
  });

  it("can't be overspent by parallel requests", async () => {
    const { service, repo } = setup({ "user-1": 3 }, { feature_request_draft: 2 });
    const results = await Promise.allSettled([
      service.charge(user, "feature_request_draft", {}),
      service.charge(user, "feature_request_draft", {}),
      service.charge(user, "feature_request_draft", {}),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(2);
    expect(repo.balances.get("user-1")).toBe(1);
  });

  it("refunds exactly once, with a refund row", async () => {
    const { service, repo } = setup({ "user-1": 5 }, { feature_request_draft: 2 });
    const charge = await service.charge(user, "feature_request_draft", {});
    await charge!.refund();
    await charge!.refund();
    expect(repo.balances.get("user-1")).toBe(5);
    expect(repo.ledger.map((l) => l.type)).toEqual(["usage", "refund"]);
  });

  it("swallows and logs a refund failure", async () => {
    const { service, repo } = setup({ "user-1": 5 }, { feature_request_draft: 2 });
    const charge = await service.charge(user, "feature_request_draft", {});
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    repo.applyDelta = jest.fn().mockRejectedValue(new Error("db down"));
    await expect(charge!.refund()).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});

describe("AiCreditService.statusFor", () => {
  it("is null when the organisation hasn't priced anything", async () => {
    const { service } = setup({ "user-1": 5 });
    expect(await service.statusFor(user, "feature_request_draft")).toBeNull();
  });

  it("reports the balance and this feature's price", async () => {
    const { service } = setup({ "user-1": 5 }, { bug_report_draft: 3 });
    expect(await service.statusFor(user, "bug_report_draft")).toEqual({ balance: 5, price: 3 });
    expect(await service.statusFor(user, "feature_request_draft")).toEqual({ balance: 5, price: 0 });
  });
});

describe("AiCreditService.grant", () => {
  it("tops up and audits in the same move", async () => {
    const { service, repo } = setup({ "user-1": 1 });
    expect(await service.grant(admin, { userId: "user-1", amount: 10, note: "  Q3 allowance " })).toEqual({ userId: "user-1", balance: 11 });
    expect(repo.ledger[0]).toMatchObject({ type: "grant", delta: 10, note: "Q3 allowance", actorId: "admin-1" });
    expect(repo.audits[0]).toMatchObject({ action: "ai_credits.granted", entityId: "user-1" });
  });

  it("corrects downward, but never below zero", async () => {
    const { service, repo } = setup({ "user-1": 4 });
    expect(await service.grant(admin, { userId: "user-1", amount: -3 })).toMatchObject({ balance: 1 });
    expect(repo.ledger[0].type).toBe("adjustment");
    const err = await service.grant(admin, { userId: "user-1", amount: -2 }).catch((e) => e);
    expect(err).toMatchObject({ statusCode: 422 });
    expect(repo.balances.get("user-1")).toBe(1);
  });

  it("only gives credits to people on the admin's team", async () => {
    const { service } = setup();
    await expect(service.grant(admin, { userId: "stranger", amount: 5 })).rejects.toMatchObject({ statusCode: 404 });
  });

  it("is only for holders of ai.managecredits", async () => {
    const { service } = setup();
    await expect(service.grant(user, { userId: "user-1", amount: 5 })).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.updatePrices(user, { feature_request_draft: 1 })).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe("AiCreditService — prices and history", () => {
  it("stores only known features with a positive price, and lists every feature back", async () => {
    const { service, repo } = setup();
    const result = await service.updatePrices(admin, { feature_request_draft: 2, bug_report_draft: 0, test_case_draft: 4 } as any);
    expect(repo.prices).toEqual({ feature_request_draft: 2 });
    expect(result).toEqual({ bug_report_draft: 0, feature_request_draft: 2, service_request_intake: 0, service_request_triage: 0 });
  });

  it("hides history without touching the balance, with a dry-run count", async () => {
    const { service, repo } = setup({ "user-1": 5 }, { feature_request_draft: 1 });
    await service.charge(user, "feature_request_draft", {});
    await service.charge(user, "feature_request_draft", {});

    expect(await service.clearHistory(user, true)).toEqual({ count: 2 });
    expect(repo.ledger.every((l) => !l.hidden)).toBe(true);

    expect(await service.clearHistory(user, false)).toEqual({ count: 2 });
    expect(repo.ledger).toHaveLength(2); // still in the ledger
    expect(repo.balances.get("user-1")).toBe(3);
    const mine = await service.mine(user, { page: 1, limit: 20 });
    expect(mine.data).toMatchObject({ metered: true, balance: 3, history: [] });
  });
});

describe("credit helpers", () => {
  it("unwraps the pg UPDATE … RETURNING shape and plain rows alike", () => {
    expect(unwrapRows([[{ balance: 3 }], 1])).toEqual([{ balance: 3 }]);
    expect(unwrapRows([[], 0])).toEqual([]);
    expect(unwrapRows([{ balance: 3 }])).toEqual([{ balance: 3 }]);
    expect(unwrapRows(undefined)).toEqual([]);
  });

  it("reads prices strictly", () => {
    expect(priceOf({ a: 2 }, "a")).toBe(2);
    expect(priceOf({ a: 0 }, "a")).toBe(0);
    expect(priceOf({ a: -1 }, "a")).toBe(0);
    expect(priceOf({ a: 1.5 }, "a")).toBe(0);
    expect(priceOf({}, "a")).toBe(0);
    expect(isMetered({ a: 0 })).toBe(false);
    expect(isMetered({ a: 0, b: 1 })).toBe(true);
    expect(credits(1)).toBe("1 credit");
    expect(credits(3)).toBe("3 credits");
  });
});
