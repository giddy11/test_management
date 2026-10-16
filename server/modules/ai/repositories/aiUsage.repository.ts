// modules/ai/repositories/aiUsage.repository.ts
// Append-only usage log: counts, never content.
import type { Repository } from "typeorm";
import { AiUsageLog } from "../entities/aiUsageLog.entity";
import { AppDataSource } from "../../../infrastructure/database/dataSource";

export type NewAiUsage = Omit<AiUsageLog, "id" | "createdAt" | "user" | "project">;

export class AiUsageRepository {
  static Instance = new AiUsageRepository();

  private repo: Repository<AiUsageLog>;

  constructor() {
    this.repo = AppDataSource.getRepository(AiUsageLog);
  }

  async create(entry: NewAiUsage): Promise<void> {
    await this.repo.insert(entry);
  }
}
