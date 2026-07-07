// modules/user/repositories/user.repository.js
// Data access for company member management. Reuses the User entity.
const { AppDataSource } = require("../../../infrastructure/database/dataSource");
const { User } = require("../../auth/entities/user.entity");
const { buildMeta, getOffset } = require("../../../shared/pagination/paginate");

class UserRepository {
  static Instance = new UserRepository();

  constructor() {
    this.repo = AppDataSource.getRepository(User);
  }

  // organizationId omitted => unscoped (superadmin view).
  async fetchPaginated({ organizationId, page = 1, limit = 20, search }) {
    const offset = getOffset(page, limit);
    const qb = this.repo
      .createQueryBuilder("u")
      .where("u.deleted_at IS NULL")
      .orderBy("u.createdAt", "DESC")
      .skip(offset)
      .take(limit);

    if (organizationId) {
      qb.andWhere("u.organization_id = :organizationId", { organizationId });
    }
    if (search) {
      qb.andWhere(
        "(u.first_name ILIKE :s OR u.last_name ILIKE :s OR u.email ILIKE :s)",
        { s: `%${search}%` }
      );
    }

    const total = page === 1 ? await qb.getCount() : 0;
    const data = await qb.getMany();
    return { data, meta: buildMeta(page, limit, total, data.length) };
  }

  async findById(id) {
    return this.repo.findOne({ where: { id } });
  }

  // The organisation's owner = the account that created it, i.e. the earliest-created
  // user in the org (the admin who registered; members are created afterwards).
  // Includes soft-deleted rows so the owner's identity stays stable. Returns the id.
  async findOrgOwnerId(organizationId) {
    if (!organizationId) return null;
    const row = await this.repo
      .createQueryBuilder("u")
      .select("u.id", "id")
      .where("u.organization_id = :organizationId", { organizationId })
      .orderBy("u.created_at", "ASC")
      .addOrderBy("u.id", "ASC")
      .withDeleted()
      .limit(1)
      .getRawOne();
    return row ? row.id : null;
  }

  async findByEmail(email) {
    return this.repo.findOne({ where: { email } });
  }

  async create(data) {
    return this.repo.save(this.repo.create(data));
  }

  async update(id, data) {
    await this.repo.update(id, data);
    return this.findById(id);
  }

  async softDelete(id) {
    await this.repo.softDelete(id);
  }

  // Called when a user's last realtime connection drops (see socketServer.js).
  async touchLastSeen(id) {
    await this.repo.update(id, { lastSeenAt: new Date() });
  }
}

module.exports = { UserRepository };
