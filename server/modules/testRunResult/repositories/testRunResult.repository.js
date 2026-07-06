// modules/testRunResult/repositories/testRunResult.repository.js
const { AppDataSource } = require("../../../infrastructure/database/dataSource");
const { TestRunResult } = require("../entities/testRunResult.entity");
const { buildMeta, getOffset } = require("../../../shared/pagination/paginate");

class TestRunResultRepository {
  static Instance = new TestRunResultRepository();

  constructor() {
    this.repo = AppDataSource.getRepository(TestRunResult);
  }

  // assigneeId set => only results whose test case is assigned to that user.
  async fetchPaginated({ runId, page = 1, limit = 20, status, assigneeId, search }) {
    const offset = getOffset(page, limit);
    const qb = this.repo
      .createQueryBuilder("result")
      .leftJoin("result.testCase", "tc")
      .addSelect(["tc.id", "tc.title", "tc.description", "tc.priority", "tc.steps", "tc.expectedResult", "tc.tags"])
      .where("result.run_id = :runId", { runId }) // indexed FK
      .orderBy("result.executedAt", "DESC", "NULLS LAST")
      .addOrderBy("tc.title", "ASC")
      .skip(offset)
      .take(limit);

    if (status) {
      qb.andWhere("result.status = :status", { status });
    }
    if (assigneeId) {
      qb.andWhere(
        `EXISTS (SELECT 1 FROM test_case_assignees tca WHERE tca.test_case_id = result.test_case_id AND tca.user_id = :assigneeId)`,
        { assigneeId }
      );
    }
    if (search) {
      qb.andWhere("tc.title ILIKE :search", { search: `%${search}%` });
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

  // Bulk-insert the snapshot rows when a run is created.
  async createMany(rows) {
    if (!rows.length) return [];
    return this.repo.save(this.repo.create(rows));
  }

  async update(id, data) {
    await this.repo.update(id, data);
    return this.findById(id);
  }

  async delete(id) {
    await this.repo.delete(id);
  }

  // Set the same status/executor fields on multiple results within one run.
  async bulkUpdateForRun(runId, ids, patch) {
    if (!ids.length) return;
    await this.repo
      .createQueryBuilder()
      .update()
      .set(patch)
      .where("run_id = :runId", { runId })
      .andWhere("id IN (:...ids)", { ids })
      .execute();
  }

  // Aggregated counts per status for a run — powers the dashboard summary.
  // assigneeId set => counts only cover cases assigned to that user (mirrors fetchPaginated).
  async statusSummary(runId, assigneeId) {
    const qb = this.repo
      .createQueryBuilder("result")
      .select("result.status", "status")
      .addSelect("COUNT(*)", "count")
      .where("result.run_id = :runId", { runId })
      .groupBy("result.status");

    if (assigneeId) {
      qb.andWhere(
        `EXISTS (SELECT 1 FROM test_case_assignees tca WHERE tca.test_case_id = result.test_case_id AND tca.user_id = :assigneeId)`,
        { assigneeId }
      );
    }

    const rows = await qb.getRawMany();

    return rows.reduce(
      (acc, r) => {
        acc[r.status ?? "pending"] = Number(r.count);
        acc.total += Number(r.count);
        return acc;
      },
      { total: 0 }
    );
  }
}

module.exports = { TestRunResultRepository };
