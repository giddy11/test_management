// modules/notification/repositories/notification.repository.js
const { IsNull } = require("typeorm");
const { AppDataSource } = require("../../../infrastructure/database/dataSource");
const { Notification } = require("../entities/notification.entity");
const { buildMeta, getOffset } = require("../../../shared/pagination/paginate");

class NotificationRepository {
  static Instance = new NotificationRepository();

  constructor() {
    this.repo = AppDataSource.getRepository(Notification);
  }

  async createMany(rows) {
    if (!rows.length) return [];
    return this.repo.save(this.repo.create(rows));
  }

  async fetchPaginated({ userId, page = 1, limit = 20 }) {
    const offset = getOffset(page, limit);
    const qb = this.repo
      .createQueryBuilder("n")
      .where("n.user_id = :userId", { userId }) // indexed
      .orderBy("n.created_at", "DESC")
      .skip(offset)
      .take(limit);

    const total = page === 1 ? await qb.getCount() : 0;
    const data = await qb.getMany();
    return { data, meta: buildMeta(page, limit, total, data.length) };
  }

  async unreadCount(userId) {
    return this.repo.count({ where: { userId, readAt: IsNull() } });
  }

  async markRead(id, userId) {
    await this.repo.update({ id, userId }, { readAt: new Date() });
  }

  async markAllRead(userId) {
    await this.repo.update({ userId, readAt: IsNull() }, { readAt: new Date() });
  }
}

module.exports = { NotificationRepository };
