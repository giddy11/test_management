// modules/bug/repositories/bug.repository.js
const { AppDataSource } = require("../../../infrastructure/database/dataSource");
const { Bug } = require("../entities/bug.entity");
const { buildMeta, getOffset } = require("../../../shared/pagination/paginate");

class BugRepository {
  static Instance = new BugRepository();

  constructor() {
    this.repo = AppDataSource.getRepository(Bug);
  }

  async fetchPaginated({
    projectId,
    page = 1,
    limit = 20,
    status,
    severity,
    priority,
    assignedToId,
    search,
  }) {
    const offset = getOffset(page, limit);
    const qb = this.repo
      .createQueryBuilder("bug")
      .leftJoinAndSelect("bug.reportedBy", "reportedBy")
      .leftJoinAndSelect("bug.assignedTo", "assignedTo")
      .where("bug.project_id = :projectId", { projectId }) // indexed FK
      .andWhere("bug.deleted_at IS NULL")
      .orderBy("bug.createdAt", "DESC")
      .skip(offset)
      .take(limit);

    if (status) qb.andWhere("bug.status = :status", { status });
    if (severity) qb.andWhere("bug.severity = :severity", { severity });
    if (priority) qb.andWhere("bug.priority = :priority", { priority });
    if (assignedToId) qb.andWhere("bug.assigned_to_id = :assignedToId", { assignedToId });
    if (search) qb.andWhere("bug.title ILIKE :search", { search: `%${search}%` });

    const total = page === 1 ? await qb.getCount() : 0;
    const data = await qb.getMany();
    return { data, meta: buildMeta(page, limit, total, data.length) };
  }

  async findById(id) {
    return this.repo.findOne({
      where: { id },
      relations: { reportedBy: true, assignedTo: true },
    });
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
}

module.exports = { BugRepository };
