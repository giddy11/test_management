// modules/siteBanner/repositories/siteBanner.repository.ts
import type { Repository } from "typeorm";
import { SiteBanner } from "../entities/siteBanner.entity";
import { AppDataSource } from "../../../infrastructure/database/dataSource";

const SINGLETON_ID = "global";

export interface ActivatePatch {
  message: string;
  durationMinutes: number;
  startedAt: Date;
  expiresAt: Date;
  updatedBy: string;
}

export class SiteBannerRepository {
  static Instance = new SiteBannerRepository();

  private repo: Repository<SiteBanner>;

  constructor() {
    this.repo = AppDataSource.getRepository(SiteBanner);
  }

  // Lazily creates the single row on first read — no seed migration needed.
  async getOrCreate(): Promise<SiteBanner> {
    const existing = await this.repo.findOne({ where: { id: SINGLETON_ID } });
    if (existing) return existing;

    return this.repo.save(
      this.repo.create({
        id: SINGLETON_ID,
        message: null,
        isActive: false,
        durationMinutes: null,
        startedAt: null,
        expiresAt: null,
        updatedBy: null,
      })
    );
  }

  async activate(patch: ActivatePatch): Promise<SiteBanner> {
    await this.getOrCreate();
    await this.repo.update(SINGLETON_ID, { ...patch, isActive: true });
    return this.getOrCreate();
  }

  // Keeps last message/durationMinutes so the superadmin form can prefill next time.
  async deactivate(updatedBy: string): Promise<SiteBanner> {
    await this.getOrCreate();
    await this.repo.update(SINGLETON_ID, {
      isActive: false,
      expiresAt: null,
      updatedBy,
    });
    return this.getOrCreate();
  }
}
