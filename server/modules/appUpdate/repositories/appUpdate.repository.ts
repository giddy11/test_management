// modules/appUpdate/repositories/appUpdate.repository.ts
import type { Repository } from "typeorm";
import { AppUpdate } from "../entities/appUpdate.entity";
import type { AppUpdateAudience } from "../entities/appUpdate.entity";
import { AppDataSource } from "../../../infrastructure/database/dataSource";
const {
  isAdministrativeAudience,
} = require("../../../shared/access/scope");

export interface CreateAppUpdateData {
  title: string;
  body: string;
  audience: AppUpdateAudience;
  recipientIds?: string[] | null;
}

export class AppUpdateRepository {
  static Instance = new AppUpdateRepository();

  private repo: Repository<AppUpdate>;

  constructor() {
    this.repo = AppDataSource.getRepository(AppUpdate);
  }

  async create(data: CreateAppUpdateData): Promise<AppUpdate> {
    return this.repo.save(this.repo.create(data));
  }

  // Publishes several announcements in one go, preserving the given order —
  // used by the superadmin's "publish all" bulk action.
  async createMany(items: CreateAppUpdateData[]): Promise<AppUpdate[]> {
    if (!items.length) return [];
    return this.repo.save(this.repo.create(items));
  }

  // All announcements, newest first — the superadmin's publishing page.
  async findAll(limit = 50): Promise<AppUpdate[]> {
    return this.repo.find({ order: { createdAt: "DESC" }, take: limit });
  }

  // Updates the actor hasn't seen yet AND is targeted by (audience "all", or
  // "admins" when the actor is admin/superadmin, or "custom" naming their id).
  // Newest first, capped so a long-absent user isn't flooded.
  async findUnseen(
    actor: { id: string; role: string },
    seenAt: Date | null,
    limit = 10
  ): Promise<AppUpdate[]> {
    // Audience filter, not an authorisation check — it decides which
    // announcements are relevant to this reader.
    const isAdmin = isAdministrativeAudience(actor);

    const qb = this.repo
      .createQueryBuilder("u")
      .andWhere(
        `(u.audience = 'all' OR (u.audience = 'admins' AND :isAdmin) OR (u.audience = 'custom' AND :actorId = ANY(u.recipient_ids)))`,
        { isAdmin, actorId: actor.id }
      )
      .orderBy("u.createdAt", "DESC")
      .take(limit);

    if (seenAt) qb.andWhere("u.created_at > :seenAt", { seenAt });

    return qb.getMany();
  }

  // Bulk delete from the superadmin's publishing page — TypeORM's softDelete
  // accepts an array of ids, setting deletedAt on each in one query.
  async softDeleteMany(ids: string[]): Promise<void> {
    await this.repo.softDelete(ids);
  }
}
