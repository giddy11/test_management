// modules/activity/services/activity.service.js
const { ActivityRepository } = require("../repositories/activity.repository");
const { UserRole } = require("../../../config/constants");
const { buildMeta } = require("../../../shared/pagination/paginate");
const {
  isExternalSupporter,
  seesAllProjects,
} = require("../../../shared/access/scope");

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
    const empty = () => ({
      data: [],
      meta: buildMeta(params.page ?? 1, params.limit ?? 20, 0, 0),
    });

    // An external supporter only ever sees their own client company's log —
    // never the rest of the organisation's, so organizationId isn't used to
    // scope them.
    if (isExternalSupporter(actor)) {
      return this.repo.fetchPaginated({
        ...params,
        organizationId: undefined,
        clientCompanyId: actor.clientCompanyId,
      });
    }

    // Deny by default at the scoping layer too. audit.read got the caller
    // through the route, but only an actor with organisation-wide visibility
    // may read the organisation-wide log. This is what catches the case the
    // old role check guarded: a supporter account whose clientCompanyId is
    // missing must get nothing, never a fall-through to the whole org's log.
    if (!seesAllProjects(actor) || !actor.organizationId) {
      return empty();
    }

    // A super administrator's own org is never a real client company, so this
    // is deliberately scoped the same as any other admin — not the whole platform.
    return this.repo.fetchPaginated({
      ...params,
      organizationId: actor.organizationId,
    });
  }
}

module.exports = { ActivityService };
