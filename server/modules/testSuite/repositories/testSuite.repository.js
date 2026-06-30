// modules/testSuite/repositories/testSuite.repository.js
const { AppDataSource } = require("../../../infrastructure/database/dataSource");
const { TestSuite } = require("../entities/testSuite.entity");
const { buildMeta, getOffset } = require("../../../shared/pagination/paginate");

class TestSuiteRepository {
  static Instance = new TestSuiteRepository();

  constructor() {
    this.repo = AppDataSource.getRepository(TestSuite);
  }

  async fetchPaginated({ projectId, page = 1, limit = 20, search }) {
    const offset = getOffset(page, limit);
    const qb = this.repo
      .createQueryBuilder("suite")
      .where("suite.project_id = :projectId", { projectId }) // indexed
      .andWhere("suite.deleted_at IS NULL")
      .orderBy("suite.createdAt", "DESC")
      .skip(offset)
      .take(limit);

    if (search) {
      qb.andWhere("suite.name ILIKE :search", { search: `%${search}%` });
    }

    const total = page === 1 ? await qb.getCount() : 0;
    const data = await qb.getMany();
    return { data, meta: buildMeta(page, limit, total, data.length) };
  }

  async findById(id) {
    return this.repo.findOne({ where: { id } });
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

module.exports = { TestSuiteRepository };
