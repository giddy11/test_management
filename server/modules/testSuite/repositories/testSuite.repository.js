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

    if (data.length > 0) {
      const ds = this.repo.manager.connection;
      const counts = await ds.query(
        `SELECT suite_id, COUNT(*)::int AS count FROM test_cases WHERE suite_id = ANY($1::uuid[]) AND deleted_at IS NULL GROUP BY suite_id`,
        [data.map((s) => s.id)]
      );
      const countMap = new Map(counts.map((r) => [r.suite_id, r.count]));
      data.forEach((s) => { s.caseCount = countMap.get(s.id) ?? 0; });
    }

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
