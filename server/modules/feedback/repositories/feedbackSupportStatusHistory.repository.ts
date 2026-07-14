// modules/feedback/repositories/feedbackSupportStatusHistory.repository.ts
import type { Repository } from "typeorm";
import { FeedbackSupportStatusHistory } from "../entities/feedbackSupportStatusHistory.entity";
import { AppDataSource } from "../../../infrastructure/database/dataSource";

export class FeedbackSupportStatusHistoryRepository {
  static Instance = new FeedbackSupportStatusHistoryRepository();

  private repo: Repository<FeedbackSupportStatusHistory>;

  constructor() {
    this.repo = AppDataSource.getRepository(FeedbackSupportStatusHistory);
  }

  async create(entry: { feedbackId: string; status: string; enteredAt: Date }): Promise<void> {
    await this.repo.save(this.repo.create(entry));
  }

  // Ordered oldest → newest — the shape a timeline renders directly.
  async findByFeedback(feedbackId: string): Promise<FeedbackSupportStatusHistory[]> {
    return this.repo.find({
      where: { feedbackId },
      order: { enteredAt: "ASC" },
      select: ["id", "status", "enteredAt"],
    });
  }
}
