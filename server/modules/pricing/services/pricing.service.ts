// modules/pricing/services/pricing.service.ts
// The landing page's pricing section. Anyone can read it; only the platform
// owner (pricing.manage, platform-only) can change it.
import { PricingRepository } from "../repositories/pricing.repository";
import { DEFAULT_PRICING, type PricingContent } from "../domain/defaultPricing";

const { ActivityService } = require("../../activity/services/activity.service");

export interface PricingView {
  content: PricingContent;
  // True while nothing has been saved, so the editor can say so.
  isDefault: boolean;
  updatedAt: string | null;
}

export class PricingService {
  static Instance = new PricingService();

  constructor(private readonly repo = PricingRepository.Instance) {}

  async get(): Promise<PricingView> {
    const row = await this.repo.find();
    if (!row) return { content: DEFAULT_PRICING, isDefault: true, updatedAt: null };
    return { content: row.content, isDefault: false, updatedAt: row.updatedAt.toISOString() };
  }

  // What the public landing page needs: nothing about who edited it or when.
  async getPublic(): Promise<PricingContent> {
    return (await this.get()).content;
  }

  async update(actor: { id: string }, content: PricingContent): Promise<PricingView> {
    const row = await this.repo.save(content, actor.id);
    ActivityService.Instance.log(actor, {
      action: "pricing.updated",
      summary: "Updated the pricing shown on the landing page",
      entityType: "pricing_settings",
      entityId: null,
      metadata: {
        isVisible: content.isVisible,
        plans: content.plans.map((p) => ({ id: p.id, name: p.name, monthlyPrice: p.monthlyPrice, yearlyPrice: p.yearlyPrice })),
      },
    });
    return { content: row.content, isDefault: false, updatedAt: row.updatedAt.toISOString() };
  }

  async reset(actor: { id: string }): Promise<PricingView> {
    await this.repo.clear();
    ActivityService.Instance.log(actor, {
      action: "pricing.reset",
      summary: "Reset the landing page pricing to the built-in defaults",
      entityType: "pricing_settings",
      entityId: null,
    });
    return { content: DEFAULT_PRICING, isDefault: true, updatedAt: null };
  }
}
