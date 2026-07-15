// modules/supportChat/repositories/supportChatConversation.repository.js
const { AppDataSource } = require("../../../infrastructure/database/dataSource");
const {
  SupportChatConversation,
} = require("../entities/supportChatConversation.entity");
const { buildMeta, getOffset } = require("../../../shared/pagination/paginate");
const { SupportChatStatus } = require("../../../config/constants");

class SupportChatConversationRepository {
  static Instance = new SupportChatConversationRepository();

  constructor() {
    this.repo = AppDataSource.getRepository(SupportChatConversation);
  }

  findById(id) {
    return this.repo.findOne({ where: { id }, relations: { user: true } });
  }

  // A user has at most one open conversation — that's the one the floater binds to.
  findOpenByUser(userId) {
    return this.repo.findOne({
      where: { userId, status: SupportChatStatus.OPEN },
      relations: { user: true },
    });
  }

  create(data) {
    return this.repo.save(this.repo.create(data));
  }

  async update(id, data) {
    await this.repo.update(id, data);
    return this.findById(id);
  }

  // Super-admin inbox. Optional status filter; ordered by most recent activity
  // (falling back to creation for never-answered threads).
  async fetchPaginated({ page = 1, limit = 20, status } = {}) {
    const offset = getOffset(page, limit);
    const qb = this.repo
      .createQueryBuilder("c")
      .leftJoinAndSelect("c.user", "user")
      .skip(offset)
      .take(limit)
      .orderBy("c.lastMessageAt", "DESC", "NULLS LAST")
      .addOrderBy("c.createdAt", "DESC");

    if (status) qb.andWhere("c.status = :status", { status });

    const total = await qb.getCount();
    const data = await qb.getMany();
    return { data, meta: buildMeta(page, limit, total, data.length) };
  }

  // Badge for the inbox nav item — total unanswered user messages across threads.
  async totalAdminUnread() {
    const { sum } = await this.repo
      .createQueryBuilder("c")
      .select("COALESCE(SUM(c.admin_unread), 0)", "sum")
      .getRawOne();
    return Number(sum) || 0;
  }
}

module.exports = { SupportChatConversationRepository };
