// modules/pricing/repositories/pricing.repository.ts
import type { Repository } from "typeorm";
import { PricingSettings } from "../entities/pricingSettings.entity";
import type { PricingContent } from "../domain/defaultPricing";
import { AppDataSource } from "../../../infrastructure/database/dataSource";

const SINGLETON_ID = "global";

export class PricingRepository {
  static Instance = new PricingRepository();

  private repo: Repository<PricingSettings>;

  constructor() {
    this.repo = AppDataSource.getRepository(PricingSettings);
  }

  find(): Promise<PricingSettings | null> {
    return this.repo.findOne({ where: { id: SINGLETON_ID } });
  }

  async save(content: PricingContent, updatedBy: string): Promise<PricingSettings> {
    await this.repo.save(this.repo.create({ id: SINGLETON_ID, content, updatedBy }));
    return (await this.find()) as PricingSettings;
  }

  // Deleting the row puts the landing page back on the built-in defaults.
  async clear(): Promise<void> {
    await this.repo.delete(SINGLETON_ID);
  }
}
