// shared/access/scope.js
//
// Record-level scoping helpers.
//
// Permissions say what KIND of thing you may touch. Scoping says WHICH ROWS.
// These read the actor's permissions to answer scoping questions, so that
// "what an actor can see" is still derived from role data rather than from a
// hard-coded role name — but they are not authorisation checks and never
// replace one. The route's requirePermission has already run by the time any
// of these are called.
//
// See docs/access-model.md section 5.
const { can } = require("./can");

// True when the actor sees every project in their organisation, rather than
// only the ones they are a member of or have a test case assigned in.
//
// This is what `actor.role === UserRole.USER` used to express, inverted:
// admins and superadmins held org-wide visibility, plain users did not.
function seesAllProjects(actor) {
  return can(actor, "project.readall");
}

// The inverse, as the repositories want it: the user id to filter by, or
// undefined for unrestricted.
function restrictToOwnWork(actor) {
  return seesAllProjects(actor) ? undefined : actor.id;
}

// Same thing where the repository expects null rather than undefined.
function restrictToOwnWorkOrNull(actor) {
  return seesAllProjects(actor) ? null : actor.id;
}

// True when the actor belongs to an external client company rather than to the
// product organisation. `client_company_id` is set only on supporter accounts
// (see user.entity.js), so this is the scoping fact the old
// `actor.role === UserRole.IT_SUPPORT` checks were really testing: which side
// of the product/customer boundary the caller sits on, and therefore which
// rows they may be scoped to. It is never a substitute for a permission check.
function isExternalSupporter(actor) {
  return !!actor?.clientCompanyId;
}

// An account entitled to work a client company's support queue but with no
// company attached is in a broken state. It must be denied outright, never
// silently scoped to the organisation it nominally belongs to — that would
// hand an external supporter the product organisation's data.
//
// The `seesAllProjects` clause excludes administrators, who hold every
// permission in the catalog (including supportqueue.read) and legitimately
// have no client company of their own.
function isOrphanedSupporter(actor) {
  return (
    !actor?.clientCompanyId &&
    can(actor, "supportqueue.read") &&
    !seesAllProjects(actor)
  );
}

// True when the actor sees organisation-wide reporting rather than only their
// own slice of it.
function seesOrganisationAnalytics(actor) {
  return can(actor, "analytics.read");
}

// Whether the actor counts as an administrator for "admins only" broadcast
// audiences (site banners, app updates). Not an authorisation check — it picks
// which announcements are relevant to show, not what the actor may do.
function isAdministrativeAudience(actor) {
  return can(actor, "settings.manage");
}

module.exports = {
  seesAllProjects,
  restrictToOwnWork,
  restrictToOwnWorkOrNull,
  isExternalSupporter,
  isOrphanedSupporter,
  seesOrganisationAnalytics,
  isAdministrativeAudience,
};
