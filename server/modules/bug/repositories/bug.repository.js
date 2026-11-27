// modules/bug/repositories/bug.repository.js
const { AppDataSource } = require("../../../infrastructure/database/dataSource");
const { Bug } = require("../entities/bug.entity");
const { buildMeta, getOffset } = require("../../../shared/pagination/paginate");
const { andWhereUserNameMatches } = require("../../../shared/utils/nameSearch");
const { andWhereDateRange } = require("../../../shared/utils/dateRange");
const { BugStatus } = require("../../../config/constants");

// Not yet resolved — the tab-count "pending" figure. Mirrors RESOLVED_BUG_STATUSES
// in bug.service.js (kept separate to avoid a repository -> service dependency).
const OPEN_BUG_STATUSES = [BugStatus.OPEN, BugStatus.IN_PROGRESS, BugStatus.REOPENED];

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
    from,
    to,
    pending,
  }) {
    const offset = getOffset(page, limit);
    const qb = this.repo
      .createQueryBuilder("bug")
      // Deactivating a user soft-deletes their row, and TypeORM leaves
      // soft-deleted rows out of a join by default, which would blank the
      // reporter/assignee. withDeleted() turns that off, but only for joins
      // added AFTER it, so it must stay above them. It also lifts the filter
      // on the bug itself and on any later join, hence the explicit
      // deleted checks below.
      .withDeleted()
      .leftJoinAndSelect("bug.reportedBy", "reportedBy")
      .leftJoinAndSelect("bug.assignedTo", "assignedTo")
      .where("bug.project_id = :projectId", { projectId }) // indexed FK
      .andWhere("bug.deleted_at IS NULL")
      // A set fix order (1, 2, 3, ...) always wins, ascending — everything
      // without one falls after, newest first.
      .orderBy("bug.fixOrder", "ASC", "NULLS LAST")
      .addOrderBy("bug.createdAt", "DESC")
      .skip(offset)
      .take(limit);

    if (status) qb.andWhere("bug.status = :status", { status });
    // Not resolved yet — Fixed/Verified/Closed are "done" for this count.
    if (pending) qb.andWhere("bug.status IN (:...openStatuses)", { openStatuses: OPEN_BUG_STATUSES });
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
        qb.innerJoin("bug.testCase", "testCase", "testCase.deletedAt IS NULL")
          .innerJoin("testCase.suite", "suite", "suite.deletedAt IS NULL")
          .andWhere("suite.name ILIKE :search", { search: `%${search}%` });
      } else {
        qb.andWhere("bug.title ILIKE :search", { search: `%${search}%` });
      }
    }

    andWhereDateRange(qb, "bug.created_at", { from, to });

    // Counted on every page, unlike most lists: the tab's pager needs totalPages
    // beyond page 1.
    const total = await qb.getCount();
    const data = await qb.getMany();
    return { data, meta: buildMeta(page, limit, total, data.length) };
  }

  async findById(id) {
    return this.repo.findOne({
      where: { id },
      relations: { reportedBy: true, assignedTo: true },
      // See fetchPaginated's withDeleted() comment — a deactivated
      // reporter/assignee must still show, not vanish. The bug itself is
      // separately re-checked for deletedAt by the service (getAccessible),
      // so this doesn't let a deleted bug slip through.
      withDeleted: true,
    });
  }

  async findByNumber(bugNumber) {
    return this.repo.findOne({
      where: { bugNumber },
      relations: { reportedBy: true, assignedTo: true },
      withDeleted: true,
    });
  }

  // Bugs this person reported that are marked Fixed and await their verdict,
  // longest-waiting first.
  async findAwaitingReview(reportedById, limit = 20) {
    return this.repo
      .createQueryBuilder("bug")
      .withDeleted() // keeps a deactivated assignee's name; see fetchPaginated
      .leftJoinAndSelect("bug.assignedTo", "assignedTo")
      .where("bug.reported_by_id = :reportedById", { reportedById })
      .andWhere("bug.status = :status", { status: BugStatus.FIXED })
      .andWhere("bug.deleted_at IS NULL")
      .orderBy("bug.statusUpdatedAt", "ASC", "NULLS FIRST")
      .take(limit)
      .getMany();
  }

  // Bugs assigned to this person that still need work, in the lead's fix order.
  async findAssignedOpen(assignedToId, limit = 50) {
    return this.repo
      .createQueryBuilder("bug")
      .where("bug.assigned_to_id = :assignedToId", { assignedToId })
      .andWhere("bug.status IN (:...openStatuses)", { openStatuses: OPEN_BUG_STATUSES })
      .andWhere("bug.deleted_at IS NULL")
      .orderBy("bug.fixOrder", "ASC", "NULLS LAST")
      .addOrderBy("bug.createdAt", "ASC")
      .take(limit)
      .getMany();
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

  // Denormalized — comments live in Firestore, so there's no local table to COUNT.
  // Called by the service after each successful Firestore comment write/soft-delete.
  async incrementCommentCount(id) {
    await this.repo.increment({ id }, "commentCount", 1);
  }

  async decrementCommentCount(id) {
    await this.repo.decrement({ id }, "commentCount", 1);
  }
}

module.exports = { BugRepository };
