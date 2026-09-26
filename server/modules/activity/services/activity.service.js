// modules/activity/services/activity.service.js
const { ActivityRepository } = require("../repositories/activity.repository");
const { severityFor } = require("../catalog/severity.catalog");
const { buildMetaFromTotal } = require("../../../shared/pagination/paginate");
const {
  isExternalSupporter,
  seesAllProjects,
} = require("../../../shared/access/scope");

// The actor's display name, resolved from whatever the request carries. It is
// stored ON the log row rather than joined at read time, so the entry still
// names the right person after they are renamed or removed.
function actorNameOf(actor) {
  if (!actor) return null;
  const full = [actor.firstName, actor.lastName].filter(Boolean).join(" ").trim();
  return actor.name?.trim() || full || actor.email || null;
}

class ActivityService {
  static Instance = new ActivityService();

  constructor(repo = ActivityRepository.Instance) {
    this.repo = repo;
  }

  // The row an event becomes. Pure — no I/O — so a caller that wants the audit
  // entry written inside its own transaction can build the row here and hand it
  // to the repository doing the work. See AccessRepository.setUserRoles.
  //
  // actor = { id, organizationId, role, name|firstName/lastName, email }
  // opts  = { action, summary, entityType, entityId, clientCompanyId, metadata, severity? }
  buildEntry(actor, opts) {
    return {
      organizationId: actor?.organizationId ?? null,
      actorId: actor?.id ?? null,
      actorName: actorNameOf(actor),
      actorRole: actor?.role ?? null,
      action: opts.action,
      summary: opts.summary,
      entityType: opts.entityType ?? null,
      entityId: opts.entityId ?? null,
      clientCompanyId: opts.clientCompanyId ?? null,
      // Derived from the action unless the call site says otherwise, so the ~45
      // call sites don't each have to remember to classify themselves.
      severity: opts.severity ?? severityFor(opts.action),
      metadata: opts.metadata ?? null,
    };
  }

  // Fire-and-forget logging — never let an audit write break the triggering action.
  //
  // Use this for events where losing the entry is survivable. Where it is not —
  // anything in severity.catalog's CRITICAL list — build the row with
  // buildEntry() and insert it in the same transaction as the change instead,
  // so the two can never disagree about what happened.
  log(actor, opts) {
    try {
      this.repo
        .create(this.buildEntry(actor, opts))
        .catch((e) => console.error("[activity] log failed:", e.message));
    } catch (e) {
      // buildEntry or a synchronous repository throw must not reach the caller.
      console.error("[activity] log failed:", e.message);
    }
  }

  // ── Reading ────────────────────────────────────────────────────────────────

  // Which rows this actor may read, or null for "none". Shared by the paginated
  // read and the export so the two can never disagree about scope.
  scopeFor(actor) {
    // An external supporter only ever sees their own client company's log —
    // never the rest of the organisation's, so organizationId isn't used to
    // scope them.
    if (isExternalSupporter(actor)) {
      return { organizationId: undefined, clientCompanyId: actor.clientCompanyId };
    }

    // Deny by default at the scoping layer too. audit.read got the caller
    // through the route, but only an actor with organisation-wide visibility
    // may read the organisation-wide log. This is what catches the case the
    // old role check guarded: a supporter account whose clientCompanyId is
    // missing must get nothing, never a fall-through to the whole org's log.
    if (!seesAllProjects(actor) || !actor.organizationId) return null;

    // A super administrator's own org is never a real client company, so this
    // is deliberately scoped the same as any other admin — not the whole platform.
    return { organizationId: actor.organizationId };
  }

  async fetch(actor, params) {
    const scope = this.scopeFor(actor);
    if (!scope) {
      return {
        data: [],
        meta: buildMetaFromTotal(params.page ?? 1, params.limit ?? 20, 0),
      };
    }
    return this.repo.fetchPaginated({ ...params, ...scope });
  }

  // The export's rows — same scope, same filters, no pagination.
  async fetchForExport(actor, params) {
    const scope = this.scopeFor(actor);
    if (!scope) return [];
    return this.repo.fetchForExport({ ...params, ...scope });
  }
}

module.exports = { ActivityService };
