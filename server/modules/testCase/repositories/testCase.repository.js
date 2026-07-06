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

  // Same as hasAssignmentInProject but scoped to a single suite — used to hide
  // suites a 'user' role has no assignment in, one level below project visibility.
  async hasAssignmentInSuite(suiteId, userId) {
    const ds = this.repo.manager.connection;
    const rows = await ds.query(
      `SELECT 1
       FROM test_cases tc
       JOIN test_case_assignees tca ON tca.test_case_id = tc.id
       WHERE tc.suite_id = $1 AND tc.deleted_at IS NULL AND tca.user_id = $2
       LIMIT 1`,
      [suiteId, userId]
    );
    return rows.length > 0;
  }

  // Replaces the assignee set on a case. `users` is an array of `{ id }` refs.
  async setAssignees(testCase, users) {
    testCase.assignees = users;
    return this.repo.save(testCase);
  }

  // Bulk access filter: of the given ids, return the ones that are non-deleted and
  // belong to `organizationId` (via suite → project), with the fields the bulk
  // assign flow needs for notifications + the activity log. One query, no N+1.
  async findBulkAssignable(caseIds, organizationId) {
    if (!caseIds.length) return [];
    const ds = this.repo.manager.connection;
    return ds.query(
      `SELECT tc.id, tc.title, tc.suite_id AS "suiteId", ts.name AS "suiteName",
        ts.project_id AS "projectId", p.name AS "projectName"
       FROM test_cases tc
       JOIN test_suites ts ON ts.id = tc.suite_id AND ts.deleted_at IS NULL
       JOIN projects p ON p.id = ts.project_id
       WHERE tc.id = ANY($1::uuid[]) AND tc.deleted_at IS NULL AND p.organization_id = $2`,
      [caseIds, organizationId]
    );
  }

  // Idempotently add every (caseId, userId) pair to the join table in one insert.
  // ON CONFLICT DO NOTHING means a retried request is a harmless no-op.
  async addAssignees(caseIds, userIds) {
    if (!caseIds.length || !userIds.length) return;
    const ds = this.repo.manager.connection;
    await ds.query(
      `INSERT INTO test_case_assignees (test_case_id, user_id)
       SELECT c, u FROM unnest($1::uuid[]) AS c CROSS JOIN unnest($2::uuid[]) AS u
       ON CONFLICT DO NOTHING`,
      [caseIds, userIds]
    );
  }

  // Remove the given users from every given case in one statement.
  async removeAssignees(caseIds, userIds) {
    if (!caseIds.length || !userIds.length) return;
    const ds = this.repo.manager.connection;
    await ds.query(
      `DELETE FROM test_case_assignees
       WHERE test_case_id = ANY($1::uuid[]) AND user_id = ANY($2::uuid[])`,
      [caseIds, userIds]
    );
  }

  // Set the deadline on many cases at once (null clears it).
  async setDeadlineForMany(caseIds, deadline) {
    if (!caseIds.length) return;
    const ds = this.repo.manager.connection;
    await ds.query(
      `UPDATE test_cases SET deadline = $2 WHERE id = ANY($1::uuid[])`,
      [caseIds, deadline ?? null]
    );
  }

  // Existing (caseId, userId) assignment pairs among the given cases/users, as a
  // Set of "caseId:userId" keys — lets the bulk add notify only genuinely new users.
  async findExistingAssigneePairs(caseIds, userIds) {
    if (!caseIds.length || !userIds.length) return new Set();
    const ds = this.repo.manager.connection;
    const rows = await ds.query(
      `SELECT test_case_id, user_id FROM test_case_assignees
       WHERE test_case_id = ANY($1::uuid[]) AND user_id = ANY($2::uuid[])`,
      [caseIds, userIds]
    );
    return new Set(rows.map((r) => `${r.test_case_id}:${r.user_id}`));
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
