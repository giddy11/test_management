// modules/bug/repositories/bug.repository.js
const { AppDataSource } = require("../../../infrastructure/database/dataSource");
const { Bug } = require("../entities/bug.entity");
const { buildMeta, getOffset } = require("../../../shared/pagination/paginate");
const { andWhereUserNameMatches } = require("../../../shared/utils/nameSearch");

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
    searchBy = "title",
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
    if (search) {
      if (searchBy === "reporter") {
        andWhereUserNameMatches(qb, "reportedBy", search);
      } else if (searchBy === "assignee") {
        andWhereUserNameMatches(qb, "assignedTo", search);
      } else if (searchBy === "suite") {
        // A bug reaches its suite through the test case it was raised against;
        // bugs with no linked test case have no suite and never match.
        qb.innerJoin("bug.testCase", "testCase")
          .innerJoin("testCase.suite", "suite")
          .andWhere("suite.name ILIKE :search", { search: `%${search}%` });
      } else {
        qb.andWhere("bug.title ILIKE :search", { search: `%${search}%` });
      }
    }

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

  async findByNumber(bugNumber) {
    return this.repo.findOne({
      where: { bugNumber },
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
