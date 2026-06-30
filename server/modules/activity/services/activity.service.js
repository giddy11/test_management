// modules/activity/services/activity.service.js
const { ActivityRepository } = require("../repositories/activity.repository");
const { UserRole } = require("../../../config/constants");

class ActivityService {
  static Instance = new ActivityService();

  constructor(repo = ActivityRepository.Instance) {
    this.repo = repo;
  }

  // Fire-and-forget logging — never let an audit write break the triggering action.
  // actor = { id, organizationId }. opts: { action, summary, entityType, entityId, metadata }
  log(actor, opts) {
    this.repo
      .create({
        organizationId: actor?.organizationId ?? null,
        actorId: actor?.id ?? null,
        action: opts.action,
        summary: opts.summary,
        entityType: opts.entityType ?? null,
        entityId: opts.entityId ?? null,
        metadata: opts.metadata ?? null,
      })
      .catch((e) => console.error("[activity] log failed:", e.message));
  }

  async fetch(actor, params) {
    return this.repo.fetchPaginated({
      ...params,
      organizationId: actor.role === UserRole.SUPERADMIN ? undefined : actor.organizationId,
    });
  }
}

module.exports = { ActivityService };
