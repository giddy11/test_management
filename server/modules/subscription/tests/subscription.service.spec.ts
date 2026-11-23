// SubscriptionService: which plan an organisation gets, and offline payments.
jest.mock("../../activity/services/activity.service", () => ({
  ActivityService: { Instance: { log: jest.fn() } },
}));

import { SubscriptionService } from "../services/subscription.service";
import { DEFAULT_ENTITLEMENTS } from "../domain/planCatalog";

const ORG = "11111111-1111-4111-8111-111111111111";
const actor = { id: "owner-1", organizationId: "platform-org" };
const DAY = 24 * 60 * 60 * 1000;

function makeRepo(subscription: any = null) {
  let current = subscription;
  return {
    allEntitlements: jest.fn(async () => []),
    saveEntitlements: jest.fn(async () => undefined),
    findSubscription: jest.fn(async () => current),
    findSubscriptions: jest.fn(async () => (current ? [current] : [])),
    saveSubscription: jest.fn(async (row: any) => {
      current = { ...row, createdAt: new Date(), updatedAt: new Date() };
      return current;
    }),
    clearSubscription: jest.fn(async () => {
      current = null;
    }),
    addPayment: jest.fn(async (row: any) => ({ id: "pay-1", createdAt: new Date(), ...row })),
    listPayments: jest.fn(async () => []),
    organizationExists: jest.fn(async () => true),
  };
}

describe("SubscriptionService — which plan an organisation gets", () => {
  it("puts an organisation with no subscription on Free", async () => {
    const plan = await new SubscriptionService(makeRepo() as any).current(ORG);
    expect(plan).toMatchObject({ planKey: "free", status: "free" });
    expect(plan.features).toEqual(DEFAULT_ENTITLEMENTS.free.features);
  });

  it("gives a paid plan until its paid-until date, then Free", async () => {
    const paid = makeRepo({ organizationId: ORG, planKey: "standard", status: "active", paidUntil: new Date(Date.now() + DAY), trialEndsAt: null, source: "offline_payment", note: null });
    expect((await new SubscriptionService(paid as any).current(ORG)).planKey).toBe("standard");

    const lapsed = makeRepo({ organizationId: ORG, planKey: "standard", status: "active", paidUntil: new Date(Date.now() - DAY), trialEndsAt: null, source: "offline_payment", note: null });
    expect(await new SubscriptionService(lapsed as any).current(ORG)).toMatchObject({ planKey: "free", status: "expired", assignedPlanKey: "standard" });
  });

  it("keeps an active plan with no end date (complimentary)", async () => {
    const comp = makeRepo({ organizationId: ORG, planKey: "enterprise", status: "active", paidUntil: null, trialEndsAt: null, source: "manual", note: null });
    expect((await new SubscriptionService(comp as any).current(ORG)).planKey).toBe("enterprise");
  });

  it("ends a trial on its end date", async () => {
    const ended = makeRepo({ organizationId: ORG, planKey: "standard", status: "trial", paidUntil: null, trialEndsAt: new Date(Date.now() - 1000), source: "manual", note: null });
    expect(await new SubscriptionService(ended as any).current(ORG)).toMatchObject({ planKey: "free", status: "expired" });
  });

  it("refuses a feature the plan lacks with a reason the client can recognise", async () => {
    const service = new SubscriptionService(makeRepo() as any);
    await expect(service.assertFeature(ORG, "it_requests")).rejects.toMatchObject({
      statusCode: 403,
      data: { reason: "plan_feature", feature: "it_requests", planKey: "free" },
    });
    expect(await service.hasFeature(null, "it_requests")).toBe(false);
  });
});

describe("SubscriptionService — offline payments", () => {
  it("moves the organisation onto the paid plan for the months paid", async () => {
    const repo = makeRepo();
    const service = new SubscriptionService(repo as any);
    await service.recordPayment(actor, ORG, {
      planKey: "standard",
      amount: 14400,
      currency: "ngn",
      method: "bank_transfer",
      reference: "TRF-001",
      paidAt: new Date().toISOString(),
      months: 1,
    });
    expect(repo.addPayment).toHaveBeenCalledWith(expect.objectContaining({ currency: "NGN", amount: "14400.00", planKey: "standard" }));
    expect(repo.saveSubscription).toHaveBeenCalledWith(expect.objectContaining({ planKey: "standard", status: "active", source: "offline_payment" }));
    expect((await service.current(ORG)).planKey).toBe("standard");
  });

  it("extends from the current end date when the same plan is renewed early", async () => {
    const paidUntil = new Date(Date.now() + 10 * DAY);
    const repo = makeRepo({ organizationId: ORG, planKey: "standard", status: "active", paidUntil, trialEndsAt: null, source: "offline_payment", note: null });
    await new SubscriptionService(repo as any).recordPayment(actor, ORG, {
      planKey: "standard",
      amount: 144000,
      currency: "NGN",
      method: "cash",
      paidAt: new Date().toISOString(),
      months: 12,
    });
    const payment = repo.addPayment.mock.calls[0][0] as any;
    expect(payment.periodStart.getTime()).toBe(paidUntil.getTime());
    expect(payment.periodEnd.getUTCFullYear()).toBe(paidUntil.getUTCFullYear() + 1);
  });

  it("sends an organisation back to Free by clearing its subscription", async () => {
    const repo = makeRepo({ organizationId: ORG, planKey: "enterprise", status: "active", paidUntil: null, trialEndsAt: null, source: "manual", note: null });
    await new SubscriptionService(repo as any).setPlan(actor, ORG, { planKey: "free", status: "active" });
    expect(repo.clearSubscription).toHaveBeenCalledWith(ORG);
  });
});
