// modules/testRun/repositories/testRun.repository.js
const { AppDataSource } = require("../../../infrastructure/database/dataSource");
const { TestRun } = require("../entities/testRun.entity");
const { buildMeta, getOffset } = require("../../../shared/pagination/paginate");

class TestRunRepository {
  static Instance = new TestRunRepository();

  constructor() {
    this.repo = AppDataSource.getRepository(TestRun);
  }

  async fetchPaginated({ projectId, page = 1, limit = 20 }) {
    const offset = getOffset(page, limit);
    const qb = this.repo
      .createQueryBuilder("run")
      .where("run.project_id = :projectId", { projectId }) // indexed FK
      .orderBy("run.createdAt", "DESC")
      .skip(offset)
      .take(limit);

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

  async delete(id) {
    await this.repo.delete(id);
  }
}

module.exports = { TestRunRepository };
