// modules/activity/services/activity.service.js
const { ActivityRepository } = require("../repositories/activity.repository");
const { UserRole } = require("../../../config/constants");
const { buildMeta } = require("../../../shared/pagination/paginate");

class ActivityService {
  static Instance = new ActivityService();

  constructor(repo = ActivityRepository.Instance) {
    this.repo = repo;
  }

  // Fire-and-forget logging — never let an audit write break the triggering action.
  // actor = { id, organizationId }. opts: { action, summary, entityType, entityId, clientCompanyId, metadata }
  log(actor, opts) {
    this.repo
      .create({
        organizationId: actor?.organizationId ?? null,
        actorId: actor?.id ?? null,
        action: opts.action,
        summary: opts.summary,
        entityType: opts.entityType ?? null,
        entityId: opts.entityId ?? null,
        clientCompanyId: opts.clientCompanyId ?? null,
        metadata: opts.metadata ?? null,
      })
      .catch((e) => console.error("[activity] log failed:", e.message));
  }

  async fetch(actor, params) {
    // IT support only ever sees their own client company's log — never the
    // rest of the organisation's, so organizationId isn't used to scope them.
    // No clientCompanyId on the actor should never happen, but falling through
    // to an unscoped query would leak the whole org's log — return nothing instead.
    if (actor.role === UserRole.IT_SUPPORT) {
      if (!actor.clientCompanyId) {
        return { data: [], meta: buildMeta(params.page ?? 1, params.limit ?? 20, 0, 0) };
      }
      return this.repo.fetchPaginated({
        ...params,
        organizationId: undefined,
        clientCompanyId: actor.clientCompanyId,
      });
    }
    // Superadmin's own org is never a real client company, so this is
    // deliberately scoped the same as any other admin — not the whole platform.
    return this.repo.fetchPaginated({
      ...params,
      organizationId: actor.organizationId,
    });
  }
}

module.exports = { ActivityService };
