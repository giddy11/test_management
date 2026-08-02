// modules/liveChat/repositories/liveChatVisitor.repository.ts
import type { Repository } from "typeorm";
import { LiveChatVisitor } from "../entities/liveChatVisitor.entity";
import { AppDataSource } from "../../../infrastructure/database/dataSource";

const { buildMeta, getOffset } = require("../../../shared/pagination/paginate");

export interface FetchVisitorsParams {
  projectId: string;
  page?: number;
  limit?: number;
  search?: string; // matches name or email
}

export class LiveChatVisitorRepository {
  static Instance = new LiveChatVisitorRepository();

  private repo: Repository<LiveChatVisitor>;

  constructor() {
    this.repo = AppDataSource.getRepository(LiveChatVisitor);
  }

  findById(id: string): Promise<LiveChatVisitor | null> {
    return this.repo.findOne({ where: { id } });
  }

  // Scoped lookup — a visitor id from one project's widget must never resolve
  // against another project (each embed is a separate install).
  findByIdForProject(id: string, projectId: string): Promise<LiveChatVisitor | null> {
    return this.repo.findOne({ where: { id, projectId } });
  }

  // Called once, on the widget's first load for a given browser — the id is
  // then persisted client-side (localStorage) and reused on every later call.
  create(data: { projectId: string; currentUrl?: string | null; referrer?: string | null }) {
    const now = new Date();
    return this.repo.save(
      this.repo.create({
        projectId: data.projectId,
        currentUrl: data.currentUrl ?? null,
        referrer: data.referrer ?? null,
        lastSeenAt: now,
      })
    );
  }

  // Refreshes "where are they right now" — called on each widget page-load
  // ping, powers the operator dashboard's live-visitor view.
  async touch(id: string, data: { currentUrl?: string | null; referrer?: string | null }): Promise<void> {
    await this.repo.update(id, {
      ...(data.currentUrl !== undefined ? { currentUrl: data.currentUrl } : {}),
      ...(data.referrer !== undefined ? { referrer: data.referrer } : {}),
      lastSeenAt: new Date(),
    });
  }

  // Backs the offline/contact form and any mid-conversation "leave your email".
  async updateContact(id: string, data: { name?: string | null; email?: string | null }): Promise<void> {
    await this.repo.update(id, {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.email !== undefined ? { email: data.email } : {}),
    });
  }

  // The operator-side visitor/CRM list.
  async fetchPaginated({ projectId, page = 1, limit = 20, search }: FetchVisitorsParams) {
    const offset = getOffset(page, limit);
    const qb = this.repo
      .createQueryBuilder("v")
      .where("v.project_id = :projectId", { projectId })
      .orderBy("v.lastSeenAt", "DESC")
      .skip(offset)
      .take(limit);

    if (search) {
      qb.andWhere("(v.name ILIKE :search OR v.email ILIKE :search)", { search: `%${search}%` });
    }

    const total = await qb.getCount();
    const data = await qb.getMany();
    return { data, meta: buildMeta(page, limit, total, data.length) };
  }
}
