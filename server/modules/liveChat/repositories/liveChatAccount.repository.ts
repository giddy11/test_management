// modules/liveChat/repositories/liveChatAccount.repository.ts
import type { Repository } from "typeorm";
import { LiveChatAccount } from "../entities/liveChatAccount.entity";
import { AppDataSource } from "../../../infrastructure/database/dataSource";

export class LiveChatAccountRepository {
  static Instance = new LiveChatAccountRepository();

  private repo: Repository<LiveChatAccount>;

  constructor() {
    this.repo = AppDataSource.getRepository(LiveChatAccount);
  }

  // Login lookup, also used to reject a duplicate signup for the same project.
  findByProjectAndEmail(projectId: string, email: string): Promise<LiveChatAccount | null> {
    return this.repo.findOne({ where: { projectId, email } });
  }

  findById(id: string): Promise<LiveChatAccount | null> {
    return this.repo.findOne({ where: { id } });
  }

  create(data: { projectId: string; email: string; password: string; name: string; phone?: string | null }) {
    return this.repo.save(this.repo.create(data));
  }

  async touchLastLogin(id: string): Promise<void> {
    await this.repo.update(id, { lastLoginAt: new Date() });
  }
}
