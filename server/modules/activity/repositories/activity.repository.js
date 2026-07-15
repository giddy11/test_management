// modules/activity/repositories/activity.repository.js
const { AppDataSource } = require("../../../infrastructure/database/dataSource");
const { ActivityLog } = require("../entities/activityLog.entity");
const { buildMeta, getOffset } = require("../../../shared/pagination/paginate");

class ActivityRepository {
  static Instance = new ActivityRepository();

  constructor() {
    this.repo = AppDataSource.getRepository(ActivityLog);
  }

  async create(data) {
    return this.repo.save(this.repo.create(data));
  }

  // organizationId omitted => unscoped (superadmin). Joins the actor for display.
  async fetchPaginated({
    organizationId,
    clientCompanyId,
    page = 1,
    limit = 20,
    action,
    entityType,
    actorId,
  }) {
    const offset = getOffset(page, limit);
    const qb = this.repo
      .createQueryBuilder("a")
      .leftJoin("a.actor", "actor")
      .addSelect(["actor.id", "actor.firstName", "actor.lastName", "actor.email"])
      .orderBy("a.createdAt", "DESC")
      .skip(offset)
      .take(limit);

    if (organizationId) {
      qb.where("a.organization_id = :organizationId", { organizationId });
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

    const total = page === 1 ? await qb.getCount() : 0;
    const data = await qb.getMany();
    return { data, meta: buildMeta(page, limit, total, data.length) };
  }
}

module.exports = { ActivityRepository };
