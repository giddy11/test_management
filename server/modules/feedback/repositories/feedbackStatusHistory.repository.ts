// modules/feedback/repositories/feedbackStatusHistory.repository.ts
import type { Repository } from "typeorm";
import { FeedbackStatusHistory } from "../entities/feedbackStatusHistory.entity";
import { AppDataSource } from "../../../infrastructure/database/dataSource";

export class FeedbackStatusHistoryRepository {
  static Instance = new FeedbackStatusHistoryRepository();

  private repo: Repository<FeedbackStatusHistory>;

  constructor() {
    this.repo = AppDataSource.getRepository(FeedbackStatusHistory);
  }

  async create(entry: { feedbackId: string; status: string; enteredAt: Date }): Promise<void> {
    await this.repo.save(this.repo.create(entry));
  }

  // Ordered oldest → newest — the shape a timeline renders directly.
  async findByFeedback(feedbackId: string): Promise<FeedbackStatusHistory[]> {
    return this.repo.find({
      where: { feedbackId },
      order: { enteredAt: "ASC" },
      select: ["id", "status", "enteredAt"],
    });
  }
}
