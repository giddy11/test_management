// modules/project/repositories/project.repository.js
const { AppDataSource } = require("../../../infrastructure/database/dataSource");
const { Project } = require("../entities/project.entity");
const { buildMeta, getOffset } = require("../../../shared/pagination/paginate");

class ProjectRepository {
  static Instance = new ProjectRepository();

  constructor() {
    this.repo = AppDataSource.getRepository(Project);
  }

  // organizationId omitted => unscoped (superadmin view across all companies).
  async fetchPaginated({ organizationId, page = 1, limit = 20, search }) {
    const offset = getOffset(page, limit);
    const qb = this.repo
      .createQueryBuilder("project")
      .where("project.deleted_at IS NULL")
      .orderBy("project.created_at", "DESC")
      .skip(offset)
      .take(limit);

    if (organizationId) {
      qb.andWhere("project.organization_id = :organizationId", { organizationId }); // indexed
    }
    if (search) {
      qb.andWhere("project.name ILIKE :search", { search: `%${search}%` });
    }

    const total = page === 1 ? await qb.getCount() : 0;
    const data = await qb.getMany();
    return { data, meta: buildMeta(page, limit, total, data.length) };
  }

  async findById(id) {
    return this.repo.findOne({ where: { id }, relations: { members: true } });
  }

  // `data.members` (if present) must be an array of `{ id }` user references.
  async create(data) {
    return this.repo.save(this.repo.create(data));
  }

  // Saves a fully-hydrated entity — used for updates that touch the members relation.
  async save(entity) {
    return this.repo.save(entity);
  }

  async softDelete(id) {
    await this.repo.softDelete(id);
  }
}

module.exports = { ProjectRepository };
