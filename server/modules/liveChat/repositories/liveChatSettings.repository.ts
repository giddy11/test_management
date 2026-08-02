// modules/liveChat/repositories/liveChatSettings.repository.ts
import type { Repository } from "typeorm";
import { LiveChatSettings } from "../entities/liveChatSettings.entity";
import { AppDataSource } from "../../../infrastructure/database/dataSource";

export class LiveChatSettingsRepository {
  static Instance = new LiveChatSettingsRepository();

  private repo: Repository<LiveChatSettings>;

  constructor() {
    this.repo = AppDataSource.getRepository(LiveChatSettings);
  }

  // Lazily creates the row on first read — no seed needed, mirrors
  // SupportChatSettingsRepository.getOrCreate.
  async getOrCreate(projectId: string): Promise<LiveChatSettings> {
    const existing = await this.repo.findOne({ where: { projectId } });
    if (existing) return existing;
    return this.repo.save(this.repo.create({ projectId }));
  }

  async update(
    projectId: string,
    patch: Partial<Omit<LiveChatSettings, "projectId" | "project">>
  ): Promise<LiveChatSettings> {
    await this.getOrCreate(projectId);
    await this.repo.update(projectId, patch);
    return this.getOrCreate(projectId);
  }
}
