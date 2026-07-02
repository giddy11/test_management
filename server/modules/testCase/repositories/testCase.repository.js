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
  async fetchPaginated({ suiteId, page = 1, limit = 20, search, priority, status, runStatus, assigneeId }) {
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
    if (runStatus === "not_run") {
      qb.andWhere(
        "NOT EXISTS (SELECT 1 FROM test_run_results trr WHERE trr.test_case_id = tc.id)"
      );
    } else if (runStatus === "pending") {
      qb.andWhere(
        `EXISTS (SELECT 1 FROM test_run_results trr WHERE trr.test_case_id = tc.id)
         AND (SELECT trr2.status FROM test_run_results trr2 WHERE trr2.test_case_id = tc.id
              ORDER BY trr2.executed_at DESC NULLS LAST, trr2.id DESC LIMIT 1) IS NULL`
      );
    } else if (runStatus) {
      qb.andWhere(
        `(SELECT trr.status FROM test_run_results trr WHERE trr.test_case_id = tc.id
          ORDER BY trr.executed_at DESC NULLS LAST, trr.id DESC LIMIT 1) = :runStatus`,
        { runStatus }
      );
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

    await this._attachComputed(data);

    return { data, meta: buildMeta(page, limit, total, data.length) };
  }

  // Attachment counts + latest run-result status, batched across all given cases.
  // Shared by fetchPaginated() and findAllForExport() to avoid duplicating the queries.
  async _attachComputed(data) {
    if (data.length === 0) return;
    const ds = this.repo.manager.connection;
    const ids = data.map((tc) => tc.id);

    const [counts, latestStatuses] = await Promise.all([
      ds.query(
        `SELECT test_case_id, COUNT(*)::int AS count FROM test_case_attachments WHERE test_case_id = ANY($1::uuid[]) GROUP BY test_case_id`,
        [ids]
      ),
      ds.query(
        `SELECT DISTINCT ON (test_case_id) test_case_id, status
         FROM test_run_results
         WHERE test_case_id = ANY($1::uuid[])
         ORDER BY test_case_id, executed_at DESC NULLS LAST, id DESC`,
        [ids]
      ),
    ]);

    const countMap = new Map(counts.map((r) => [r.test_case_id, r.count]));
    // statusMap value: null = pending (in run, not executed). Missing key = never run.
    const statusMap = new Map(latestStatuses.map((r) => [r.test_case_id, r.status]));

    data.forEach((tc) => {
      tc.attachmentCount = countMap.get(tc.id) ?? 0;
      if (!statusMap.has(tc.id)) {
        tc.latestResultStatus = null; // never been in any run
      } else {
        tc.latestResultStatus = statusMap.get(tc.id) ?? "pending"; // null status → "pending"
      }
    });
  }

  // Unbounded — all non-deleted cases in a suite, with assignees + computed fields.
  // Used only by export, which is a one-shot bulk read, not a list endpoint.
  async findAllForExport(suiteId) {
    const data = await this.repo
      .createQueryBuilder("tc")
      .leftJoinAndSelect("tc.assignees", "assignee")
      .where("tc.suite_id = :suiteId", { suiteId })
      .andWhere("tc.deleted_at IS NULL")
      .orderBy("tc.createdAt", "ASC")
      .getMany();

    await this._attachComputed(data);
    return data;
  }

  async findById(id) {
    return this.repo.findOne({ where: { id }, relations: { assignees: true } });
  }

  // Existence check used to scope project-level visibility to the 'user' role —
  // true if this user is assigned to at least one (non-deleted) case anywhere in
  // the project, across all of the project's suites.
  async hasAssignmentInProject(projectId, userId) {
    const ds = this.repo.manager.connection;
    const rows = await ds.query(
      `SELECT 1
       FROM test_suites ts
       JOIN test_cases tc ON tc.suite_id = ts.id AND tc.deleted_at IS NULL
       JOIN test_case_assignees tca ON tca.test_case_id = tc.id
       WHERE ts.project_id = $1 AND ts.deleted_at IS NULL AND tca.user_id = $2
       LIMIT 1`,
      [projectId, userId]
    );
    return rows.length > 0;
  }

  // Replaces the assignee set on a case. `users` is an array of `{ id }` refs.
  async setAssignees(testCase, users) {
    testCase.assignees = users;
    return this.repo.save(testCase);
  }

  // Returns a Set of external_ids already present in the suite (for import dedup).
  async findExistingExternalIdSet(suiteId, externalIds) {
    if (!externalIds || externalIds.length === 0) return new Set();
    const ds = this.repo.manager.connection;
    const placeholders = externalIds.map((_, i) => `$${i + 2}`).join(", ");
    const rows = await ds.query(
      `SELECT external_id FROM test_cases
       WHERE suite_id = $1 AND deleted_at IS NULL AND external_id IN (${placeholders})`,
      [suiteId, ...externalIds]
    );
    return new Set(rows.map((r) => r.external_id));
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
