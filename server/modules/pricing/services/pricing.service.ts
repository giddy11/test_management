// modules/pricing/services/pricing.service.ts
// The landing page's pricing section. Anyone can read it; only the platform
// owner (pricing.manage, platform-only) can change it.
//
// Each card's list of benefits is worked out on every read: the benefits ticked
// for it, plus the enforced ones its plan actually includes. So turning a
// feature on or off for a plan changes the landing page too, with no second
// edit.
import { PricingRepository } from "../repositories/pricing.repository";
import {
  DEFAULT_PRICING,
  normalisePricing,
  resolvePlanFeatures,
  type PricingContent,
} from "../domain/defaultPricing";
import { SubscriptionService } from "../../subscription/services/subscription.service";

const { ActivityService } = require("../../activity/services/activity.service");

export interface PricingView {
  content: PricingContent;
  // True while nothing has been saved, so the editor can say so.
  isDefault: boolean;
  updatedAt: string | null;
}

export class PricingService {
  static Instance = new PricingService();

  constructor(
    private readonly repo = PricingRepository.Instance,
    private readonly plans: Pick<SubscriptionService, "entitlements"> = SubscriptionService.Instance
  ) {}

  private async resolve(content: PricingContent): Promise<PricingContent> {
    // Each plan's features and limits: what enforced and limit benefits show.
    return resolvePlanFeatures(content, await this.plans.entitlements());
  }

  async get(): Promise<PricingView> {
    const row = await this.repo.find();
    if (!row) return { content: await this.resolve(DEFAULT_PRICING), isDefault: true, updatedAt: null };
    return {
      content: await this.resolve(normalisePricing(row.content)),
      isDefault: false,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  // What the public landing page needs: nothing about who edited it or when.
  async getPublic(): Promise<PricingContent> {
    return (await this.get()).content;
  }

  async update(actor: { id: string }, content: PricingContent): Promise<PricingView> {
    // Stored without the worked-out lists; they're rebuilt on every read.
    const normalised = normalisePricing(content);
    const toStore = { ...normalised, plans: normalised.plans.map((p) => ({ ...p, features: [] })) };
    const row = await this.repo.save(toStore, actor.id);
    ActivityService.Instance.log(actor, {
      action: "pricing.updated",
      summary: "Updated the pricing shown on the landing page",
      entityType: "pricing_settings",
      entityId: null,
      metadata: {
        isVisible: content.isVisible,
        plans: normalised.plans.map((p) => ({
          id: p.id,
          name: p.name,
          isVisible: p.isVisible,
          monthlyPrice: p.monthlyPrice,
          yearlyPrice: p.yearlyPrice,
          benefits: p.benefitIds.length,
        })),
      },
    });
    return {
      content: await this.resolve(normalisePricing(row.content)),
      isDefault: false,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async reset(actor: { id: string }): Promise<PricingView> {
    await this.repo.clear();
    ActivityService.Instance.log(actor, {
      action: "pricing.reset",
      summary: "Reset the landing page pricing to the built-in defaults",
      entityType: "pricing_settings",
      entityId: null,
    });
    return { content: await this.resolve(DEFAULT_PRICING), isDefault: true, updatedAt: null };
  }
}
