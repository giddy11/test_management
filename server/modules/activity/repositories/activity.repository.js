// modules/activity/repositories/activity.repository.js
//
// Read and INSERT only. There is deliberately no update or delete method here:
// the activity log is append-only, and the database rejects both anyway (see
// the HardenActivityLog migration). `insert` rather than `save` for the same
// reason — save() with an id in the payload is an UPDATE.
const { AppDataSource } = require("../../../infrastructure/database/dataSource");
const { ActivityLog } = require("../entities/activityLog.entity");
const {
  buildMetaFromTotal,
  getOffset,
} = require("../../../shared/pagination/paginate");

// Ceiling on a single export, so one click cannot pull a million rows into
// memory. Mirrors MAX_EXPORT_ROWS in testCaseExport.service.js.
const MAX_EXPORT_ROWS = 20000;

class ActivityRepository {
  static Instance = new ActivityRepository();

  constructor() {
    this.repo = AppDataSource.getRepository(ActivityLog);
  }

  async create(data) {
    const result = await this.repo.insert(data);
    return { ...data, id: result.identifiers[0]?.id };
  }

  // Applies the scoping and the filter bar to a query builder. Shared by the
  // paginated read and the export so the export can never return rows the
  // on-screen view would have filtered out.
  applyFilters(qb, { organizationId, clientCompanyId, search, action, entityType, actorId, severity }) {
    if (organizationId) {
      qb.andWhere("a.organization_id = :organizationId", { organizationId });
    }
    if (clientCompanyId) {
      qb.andWhere("a.client_company_id = :clientCompanyId", { clientCompanyId });
    }
    if (action) {
      qb.andWhere("a.action ILIKE :action", { action: `${action}%` });
    }
    if (entityType) {
      qb.andWhere("a.entity_type = :entityType", { entityType });
    }
    if (actorId) {
      qb.andWhere("a.actor_id = :actorId", { actorId });
    }
    if (severity) {
      qb.andWhere("a.severity = :severity", { severity });
    }
    // Free text over who did it, what they did, and what it reads as. Matches
    // the denormalised actor_name rather than the joined user, so searching for
    // someone still finds what they did after they were removed. Served by the
    // trigram indexes from HardenActivityLog.
    if (search) {
      qb.andWhere(
        "(a.actor_name ILIKE :search OR a.summary ILIKE :search OR a.action ILIKE :search)",
        { search: `%${search}%` }
      );
    }
    return qb;
  }

  baseQuery(params) {
    const qb = this.repo
      .createQueryBuilder("a")
      .leftJoin("a.actor", "actor")
      .addSelect(["actor.id", "actor.firstName", "actor.lastName", "actor.email"])
      .orderBy("a.createdAt", "DESC")
      .addOrderBy("a.id", "DESC"); // stable paging when two rows share a timestamp
    return this.applyFilters(qb, params);
  }

  // organizationId omitted => unscoped (superadmin). Joins the actor for display.
  //
  // Unlike the rest of the app this counts on EVERY page, not just the first:
  // the audit page shows "Showing 51–100 of N", which page 1's count cannot
  // answer once the reader has moved on. The (organization_id, …, created_at)
  // indexes keep that an index scan rather than a table scan.
  async fetchPaginated({ page = 1, limit = 20, ...filters }) {
    const qb = this.baseQuery(filters).skip(getOffset(page, limit)).take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, meta: buildMetaFromTotal(page, limit, total) };
  }

  // The export's rows: the same filters, no pagination, hard-capped.
  async fetchForExport(filters) {
    return this.baseQuery(filters).take(MAX_EXPORT_ROWS).getMany();
  }
}

module.exports = { ActivityRepository, MAX_EXPORT_ROWS };
