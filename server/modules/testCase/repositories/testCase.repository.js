// modules/testCase/repositories/testCase.repository.js
const { AppDataSource } = require("../../../infrastructure/database/dataSource");
const { TestCase } = require("../entities/testCase.entity");
const { buildMeta, getOffset } = require("../../../shared/pagination/paginate");

class TestCaseRepository {
  static Instance = new TestCaseRepository();

  constructor() {
    this.repo = AppDataSource.getRepository(TestCase);
  }

  async fetchPaginated({ suiteId, page = 1, limit = 20, search, priority, status }) {
    const offset = getOffset(page, limit);
    const qb = this.repo
      .createQueryBuilder("tc")
      .where("tc.suite_id = :suiteId", { suiteId }) // indexed FK
      .andWhere("tc.deleted_at IS NULL")
      .orderBy("tc.created_at", "DESC")
      .skip(offset)
      .take(limit);

    if (search) {
      qb.andWhere("tc.title ILIKE :search", { search: `%${search}%` });
    }
    if (priority) {
      qb.andWhere("tc.priority = :priority", { priority });
    }
    if (status) {
      qb.andWhere("tc.status = :status", { status });
    }

    const total = page === 1 ? await qb.getCount() : 0;
    const data = await qb.getMany();
    return { data, meta: buildMeta(page, limit, total, data.length) };
  }

  async findById(id) {
    return this.repo.findOne({ where: { id } });
  }

  // All non-deleted cases in a suite — used to snapshot a test run.
  async findAllBySuite(suiteId) {
    return this.repo
      .createQueryBuilder("tc")
      .where("tc.suite_id = :suiteId", { suiteId })
      .andWhere("tc.deleted_at IS NULL")
      .orderBy("tc.created_at", "ASC")
      .select(["tc.id"])
      .getMany();
  }

  async create(data) {
    return this.repo.save(this.repo.create(data));
  }

  async createMany(rows) {
    if (!rows.length) return [];
    return this.repo.save(this.repo.create(rows));
  }

  async update(id, data) {
    await this.repo.update(id, data);
    return this.findById(id);
  }

  async softDelete(id) {
    await this.repo.softDelete(id);
  }
}

module.exports = { TestCaseRepository };
