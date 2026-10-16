// modules/ai/services/aiCredit.service.ts
// AI credits: a metered balance spent only when a request runs on the
// organisation's key (AiService never charges a user's own key). An org admin
// (ai.managecredits) sets a price per feature and gives people credits; a
// feature with no price is free, and an organisation with no prices has no
// metering at all.
//
// Balances move only through AiCreditRepository.applyDelta (atomic, ledgered).
import { AI_FEATURES, type AiFeature } from "../domain/features";
import { AiRequestError } from "../domain/aiErrors";
import {
  credits,
  isMetered,
  MAX_CREDIT_PRICE,
  priceOf,
  type AiCharge,
  type AiCreditCharger,
} from "../domain/credits";
import { AiCreditRepository } from "../repositories/aiCredit.repository";
import type { Actor } from "../../../shared/types/actor";

const { AppError } = require("../../../shared/errors/AppError");
const { assertPermission } = require("../../../shared/access/can");
const { ActivityService } = require("../../activity/services/activity.service");
const { buildMetaFromTotal } = require("../../../shared/pagination/paginate");

function orgOf(actor: Actor): string {
  if (!actor.organizationId) throw new AppError("No organisation on this account", 403);
  return actor.organizationId;
}

export class AiCreditService implements AiCreditCharger {
  static Instance = new AiCreditService();

  constructor(
    private readonly repo: AiCreditRepository = AiCreditRepository.Instance,
    private readonly activity = ActivityService.Instance
  ) {}

  // ── Charging (called by AiService) ──────────────────────────────────────────

  async charge(actor: Actor, feature: AiFeature, context: { projectId?: string | null }): Promise<AiCharge | null> {
    if (!actor.organizationId) return null;
    const organizationId = actor.organizationId;
    const price = priceOf(await this.repo.findPrices(organizationId), feature);
    if (!price) return null;

    const balance = await this.repo.applyDelta({
      userId: actor.id,
      organizationId,
      delta: -price,
      type: "usage",
      feature,
      projectId: context.projectId ?? null,
    });
    if (balance === null) {
      throw new AiRequestError(
        "You are out of AI credits. Ask your organisation's admin for more, or add your own API key in Settings.",
        402,
        "no_credits"
      );
    }

    let refunded = false;
    return {
      amount: price,
      refund: async () => {
        if (refunded) return;
        refunded = true;
        try {
          await this.repo.applyDelta({
            userId: actor.id,
            organizationId,
            delta: price,
            type: "refund",
            feature,
            projectId: context.projectId ?? null,
            detail: "The AI request didn't produce a usable result",
          });
        } catch (err) {
          console.error(`[ai] credit refund failed user=${actor.id} amount=${price}:`, err instanceof Error ? err.message : err);
        }
      },
    };
  }

  async statusFor(actor: Actor, feature?: AiFeature): Promise<{ balance: number; price: number } | null> {
    if (!actor.organizationId) return null;
    const prices = await this.repo.findPrices(actor.organizationId);
    if (!isMetered(prices)) return null;
    return { balance: await this.repo.balanceOf(actor.id), price: feature ? priceOf(prices, feature) : 0 };
  }

  // ── The caller's own credits ────────────────────────────────────────────────

  async mine(actor: Actor, params: { page: number; limit: number }) {
    const organizationId = orgOf(actor);
    const [prices, balance, history] = await Promise.all([
      this.repo.findPrices(organizationId),
      this.repo.balanceOf(actor.id),
      this.repo.history(actor.id, params.page, params.limit),
    ]);
    return {
      data: {
        metered: isMetered(prices),
        balance,
        prices: this.normalisedPrices(prices),
        history: history.rows,
      },
      meta: buildMetaFromTotal(params.page, params.limit, history.total),
    };
  }

  // Hides the caller's history from their own view. dryRun only counts, so the
  // confirm dialog can say how many entries will go.
  async clearHistory(actor: Actor, dryRun: boolean): Promise<{ count: number }> {
    orgOf(actor);
    return { count: await this.repo.hideHistory(actor.id, dryRun) };
  }

  // ── Administration (ai.managecredits) ──────────────────────────────────────

  async accounts(admin: Actor, params: { search?: string; page: number; limit: number }) {
    assertPermission(admin, "ai.managecredits");
    const { rows, total } = await this.repo.listAccounts(orgOf(admin), params);
    return { data: rows, meta: buildMetaFromTotal(params.page, params.limit, total) };
  }

  // Positive tops up; negative corrects, but never below zero.
  async grant(admin: Actor, input: { userId: string; amount: number; note?: string | null }) {
    assertPermission(admin, "ai.managecredits");
    const organizationId = orgOf(admin);
    if (!(await this.repo.isMemberOf(input.userId, organizationId))) {
      throw new AppError("That person isn't on your team", 404);
    }
    const note = input.note?.trim() || null;
    const audit = this.activity.buildEntry(admin, {
      action: "ai_credits.granted",
      summary: input.amount > 0 ? `Gave ${credits(input.amount)} for AI` : `Took back ${credits(-input.amount)} of AI credit`,
      entityType: "user",
      entityId: input.userId,
      metadata: { amount: input.amount, note },
    });
    const balance = await this.repo.applyDelta(
      {
        userId: input.userId,
        organizationId,
        delta: input.amount,
        type: input.amount > 0 ? "grant" : "adjustment",
        note,
        actorId: admin.id,
      },
      audit
    );
    if (balance === null) {
      const message = "That would take their balance below zero.";
      throw new AppError(message, 422, [{ field: "amount", message }]);
    }
    return { userId: input.userId, balance };
  }

  async prices(admin: Actor) {
    assertPermission(admin, "ai.managecredits");
    return this.normalisedPrices(await this.repo.findPrices(orgOf(admin)));
  }

  async updatePrices(admin: Actor, input: Record<string, number>) {
    assertPermission(admin, "ai.managecredits");
    const organizationId = orgOf(admin);
    // Only known features, only positive whole numbers; 0 is stored as absent.
    const prices: Record<string, number> = {};
    for (const feature of AI_FEATURES) {
      const p = priceOf(input, feature);
      if (p) prices[feature] = Math.min(p, MAX_CREDIT_PRICE);
    }
    await this.repo.savePrices(
      organizationId,
      prices,
      admin.id,
      this.activity.buildEntry(admin, {
        action: "ai_credits.prices_updated",
        summary: "Updated what AI features cost on the organisation's key",
        entityType: "ai_settings",
        entityId: organizationId,
        metadata: { prices },
      })
    );
    return this.normalisedPrices(prices);
  }

  // Every feature listed, with 0 for free, so the UI doesn't have to fill gaps.
  private normalisedPrices(prices: Record<string, number>): Record<AiFeature, number> {
    return Object.fromEntries(AI_FEATURES.map((f) => [f, priceOf(prices, f)])) as Record<AiFeature, number>;
  }
}
