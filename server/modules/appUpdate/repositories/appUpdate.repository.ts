// modules/appUpdate/repositories/appUpdate.repository.ts
import type { Repository } from "typeorm";
import { MoreThan } from "typeorm";
import { AppUpdate } from "../entities/appUpdate.entity";
import { AppDataSource } from "../../../infrastructure/database/dataSource";

export class AppUpdateRepository {
  static Instance = new AppUpdateRepository();

  private repo: Repository<AppUpdate>;

  constructor() {
    this.repo = AppDataSource.getRepository(AppUpdate);
  }

  async create(data: { title: string; body: string }): Promise<AppUpdate> {
    return this.repo.save(this.repo.create(data));
  }

  // Publishes several announcements in one go, preserving the given order —
  // used by the superadmin's "publish all" bulk action.
  async createMany(items: { title: string; body: string }[]): Promise<AppUpdate[]> {
    if (!items.length) return [];
    return this.repo.save(this.repo.create(items));
  }

  // All announcements, newest first — the superadmin's publishing page.
  async findAll(limit = 50): Promise<AppUpdate[]> {
    return this.repo.find({ order: { createdAt: "DESC" }, take: limit });
  }

  // Updates the user hasn't seen yet, newest first, capped so a long-absent
  // admin isn't flooded.
  async findUnseen(seenAt: Date | null, limit = 10): Promise<AppUpdate[]> {
    return this.repo.find({
      where: seenAt ? { createdAt: MoreThan(seenAt) } : {},
      order: { createdAt: "DESC" },
      take: limit,
    });
  }
}
