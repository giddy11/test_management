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
      .leftJoin("run.createdBy", "creator")
      .addSelect(["creator.id", "creator.firstName", "creator.lastName"])
      .where("run.project_id = :projectId", { projectId })
      .orderBy("run.createdAt", "DESC")
      .skip(offset)
      .take(limit);

    const total = page === 1 ? await qb.getCount() : 0;
    const data = await qb.getMany();

    // Batch-fetch distinct testers (users who recorded any result in each run).
    if (data.length > 0) {
      const ds = this.repo.manager.connection;
      const rows = await ds.query(
        `SELECT res.run_id,
           trim(concat(u.first_name, ' ', u.last_name)) AS name
         FROM test_run_results res
         JOIN users u ON res.executed_by_id = u.id
         WHERE res.run_id = ANY($1::uuid[])
           AND res.status IS NOT NULL
         GROUP BY res.run_id, u.id, u.first_name, u.last_name
         ORDER BY u.first_name`,
        [data.map((r) => r.id)]
      );
      const testerMap = new Map();
      for (const row of rows) {
        if (!testerMap.has(row.run_id)) testerMap.set(row.run_id, []);
        testerMap.get(row.run_id).push(row.name);
      }
      data.forEach((run) => {
        run.testers = testerMap.get(run.id) ?? [];
      });
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

  async delete(id) {
    await this.repo.delete(id);
  }
}

module.exports = { TestRunRepository };
