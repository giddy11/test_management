// test/actors.js
// Test fixtures for request actors.
//
// Services no longer branch on a role name — they call can(actor, code) against
// actor.permissions, which authMiddleware + permissionsMiddleware resolve from
// the database at request time. Specs therefore need an actor carrying a real
// permission set, not just a role string.
//
// permissionsFor() derives that set from the SAME catalog the seed uses, keyed
// by the legacy role the spec was written against, so a spec that says "a plain
// user" keeps meaning exactly what it meant before the migration.
const {
  BUILTIN_ROLES,
  ROLE_KEYS,
  roleKeyForLegacyUser,
} = require("../modules/access/catalog/permissions.catalog");

// What only a support lead may do: route work to a teammate and turn on
// auto-assign. (Changing the company's roster is not a permission any more: it is
// the company's own lead, checked in ClientCompanyService.)
const LEAD_ONLY = ["supportqueue.assign", "company.autoassign"];

// A supporter who is not a lead has no built-in role — an admin gives them one,
// typically a custom role. Specs that need that persona get the Support lead set
// minus the lead-only permissions: they work their own items and nothing more.
function plainSupporterPermissions() {
  const lead = BUILTIN_ROLES.find((r) => r.key === ROLE_KEYS.SUPPORT_LEAD);
  return new Set(lead.permissions.filter((code) => !LEAD_ONLY.includes(code)));
}

// legacyRole: "superadmin" | "admin" | "user" | "it_support"
function permissionsFor(legacyRole, isSupportLead = false, isTeamLead = false) {
  const key = roleKeyForLegacyUser(legacyRole, isSupportLead, isTeamLead);
  if (key === null) return plainSupporterPermissions();
  const role = BUILTIN_ROLES.find((r) => r.key === key);
  if (!role) throw new Error(`No built-in role for legacy role "${legacyRole}"`);
  return new Set(role.permissions);
}

// The permission set of a named built-in role, for specs that want to assert
// against the new roles directly rather than the legacy mapping.
function permissionsForRole(roleKey) {
  const role = BUILTIN_ROLES.find((r) => r.key === roleKey);
  if (!role) throw new Error(`Unknown role key "${roleKey}"`);
  return new Set(role.permissions);
}

// A whole actor, as req.user looks after the middleware chain.
function actorFor(legacyRole, overrides = {}) {
  return {
    id: overrides.id ?? "actor-1",
    role: legacyRole,
    organizationId: overrides.organizationId ?? "org-1",
    permissions: permissionsFor(
      legacyRole,
      overrides.isSupportLead,
      overrides.isTeamLead
    ),
    ...overrides,
  };
}

module.exports = { permissionsFor, permissionsForRole, plainSupporterPermissions, actorFor };
