// modules/testCase/repositories/testCase.repository.js
const { AppDataSource } = require("../../../infrastructure/database/dataSource");
const { TestCase } = require("../entities/testCase.entity");
const { buildMeta, getOffset } = require("../../../shared/pagination/paginate");

class TestCaseRepository {
  static Instance = new TestCaseRepository();

  constructor() {
    this.repo = AppDataSource.getRepository(TestCase);
  }

  // assigneeId set => only cases assigned to that user (used to scope 'user' role).
  async fetchPaginated({ suiteId, page = 1, limit = 20, search, priority, status, assigneeId }) {
    const offset = getOffset(page, limit);
    const qb = this.repo
      .createQueryBuilder("tc")
      .leftJoinAndSelect("tc.assignees", "assignee")
      .where("tc.suite_id = :suiteId", { suiteId }) // indexed FK
      .andWhere("tc.deleted_at IS NULL")
      .orderBy("tc.createdAt", "DESC")
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
    if (assigneeId) {
      // Restrict to cases this user is assigned to (separate exists subquery so the
      // selected assignee list still includes all assignees).
      qb.andWhere(
        `EXISTS (SELECT 1 FROM test_case_assignees tca WHERE tca.test_case_id = tc.id AND tca.user_id = :assigneeId)`,
        { assigneeId }
      );
    }

    const total = page === 1 ? await qb.getCount() : 0;
    const data = await qb.getMany();
    return { data, meta: buildMeta(page, limit, total, data.length) };
  }

  async findById(id) {
    return this.repo.findOne({ where: { id }, relations: { assignees: true } });
  }

  // Replaces the assignee set on a case. `users` is an array of `{ id }` refs.
  async setAssignees(testCase, users) {
    testCase.assignees = users;
    return this.repo.save(testCase);
  }

  // All non-deleted cases in a suite — used to snapshot a test run.
  async findAllBySuite(suiteId) {
    return this.repo
      .createQueryBuilder("tc")
      .where("tc.suite_id = :suiteId", { suiteId })
      .andWhere("tc.deleted_at IS NULL")
      .orderBy("tc.createdAt", "ASC")
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
