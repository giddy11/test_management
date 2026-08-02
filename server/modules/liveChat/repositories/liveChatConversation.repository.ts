// modules/liveChat/repositories/liveChatConversation.repository.ts
import type { Repository } from "typeorm";
import { LiveChatConversation } from "../entities/liveChatConversation.entity";
import { AppDataSource } from "../../../infrastructure/database/dataSource";
import { LiveChatStatus } from "../../../config/constants";

const { buildMeta, getOffset } = require("../../../shared/pagination/paginate");

export interface FetchConversationsParams {
  projectId: string;
  page?: number;
  limit?: number;
  status?: string;
  assignedAgentId?: string;
  unassigned?: boolean;
}

export class LiveChatConversationRepository {
  static Instance = new LiveChatConversationRepository();

  private repo: Repository<LiveChatConversation>;

  constructor() {
    this.repo = AppDataSource.getRepository(LiveChatConversation);
  }

  findById(id: string): Promise<LiveChatConversation | null> {
    return this.repo.findOne({
      where: { id },
      relations: { visitor: true, assignedAgent: true },
    });
  }

  // A visitor has at most one open conversation per project — that's the one
  // the widget binds to (enforced by a partial unique index; see the migration).
  findOpenByVisitor(visitorId: string): Promise<LiveChatConversation | null> {
    return this.repo.findOne({
      where: { visitorId, status: LiveChatStatus.OPEN },
      relations: { visitor: true, assignedAgent: true },
    });
  }

  create(data: Partial<LiveChatConversation>): Promise<LiveChatConversation> {
    return this.repo.save(this.repo.create(data));
  }

  async update(
    id: string,
    data: Partial<Omit<LiveChatConversation, "project" | "visitor" | "assignedAgent">>
  ): Promise<LiveChatConversation | null> {
    await this.repo.update(id, data);
    return this.findById(id);
  }

  // The operator inbox for one project. Optional status/assignment filters —
  // same shape as FeedbackRepository's IT-queue mode (assignedAgentId /
  // unassigned), ordered by most recent activity.
  async fetchPaginated({
    projectId,
    page = 1,
    limit = 20,
    status,
    assignedAgentId,
    unassigned,
  }: FetchConversationsParams) {
    const offset = getOffset(page, limit);
    const qb = this.repo
      .createQueryBuilder("c")
      .leftJoinAndSelect("c.visitor", "visitor")
      .leftJoinAndSelect("c.assignedAgent", "assignedAgent")
      .where("c.project_id = :projectId", { projectId })
      .skip(offset)
      .take(limit)
      .orderBy("c.lastMessageAt", "DESC", "NULLS LAST")
      .addOrderBy("c.createdAt", "DESC");

    if (status) qb.andWhere("c.status = :status", { status });
    if (unassigned) qb.andWhere("c.assigned_agent_id IS NULL");
    else if (assignedAgentId) qb.andWhere("c.assigned_agent_id = :assignedAgentId", { assignedAgentId });

    const total = await qb.getCount();
    const data = await qb.getMany();
    return { data, meta: buildMeta(page, limit, total, data.length) };
  }

  // Badge for the inbox nav item — total unanswered visitor messages across a project's threads.
  async totalAgentUnread(projectId: string): Promise<number> {
    const { sum } = await this.repo
      .createQueryBuilder("c")
      .select("COALESCE(SUM(c.agent_unread), 0)", "sum")
      .where("c.project_id = :projectId", { projectId })
      .getRawOne();
    return Number(sum) || 0;
  }
}
