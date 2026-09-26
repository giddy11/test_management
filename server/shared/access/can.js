// shared/access/can.js
//
// THE authorization helper. Every permission decision in the app goes through
// `can` or one of the guards below — no application code compares role names.
//
//   can(actor, "role.manage")             -> boolean
//   assertPermission(actor, "role.assign") -> throws AppError(403)
//   requirePermission("role.manage")      -> Express middleware
//   requireAny("role.manage","role.assign") -> Express middleware (union)
//   requireProjectAccess(reason)          -> Express middleware: project.read, then the
//                                            service decides by role IN the project
//   publicRoute()                         -> explicit opt-out of the default deny
//
// Effective permissions are the union of every role the actor holds. A role
// holding the wildcard '*' implies every permission, including ones added to
// the catalog later.
//
// `actor.permissions` is attached by permissions.middleware.js, which resolves
// it from the database on every request — never from the access token, so a role
// edit takes effect immediately (see docs/access-model.md section 8).
const { ApiResponse } = require("../response/apiResponse");
const { AppError } = require("../errors/AppError");
const { WILDCARD } = require("../../modules/access/catalog/permissions.catalog");

// Marks a handler as the deny-by-default guard so the boot-time audit can tell
// a declared route from an undeclared one.
const GUARD_TAG = Symbol.for("testmate.access.guard");

function permissionSetOf(actor) {
  if (!actor) return null;
  const set = actor.permissions;
  if (set instanceof Set) return set;
  if (Array.isArray(set)) return new Set(set);
  return null;
}

// The single source of truth for "may this actor do this?".
function can(actor, code) {
  const set = permissionSetOf(actor);
  if (!set) return false; // unresolved permissions deny — never fail open
  return set.has(WILDCARD) || set.has(code);
}

// True only for a holder of the wildcard — the locked super-administrator role.
// Used by the no-escalation guard, which lets a super administrator grant
// anything and everyone else grant only what they already hold.
function hasWildcard(actor) {
  const set = permissionSetOf(actor);
  return !!set && set.has(WILDCARD);
}

function canAny(actor, codes) {
  return codes.some((code) => can(actor, code));
}

function canAll(actor, codes) {
  return codes.every((code) => can(actor, code));
}

// Service-layer guard. Controllers pass req.user straight through, so services
// can enforce without knowing about Express.
function assertPermission(actor, code) {
  if (!can(actor, code)) {
    throw new AppError("You do not have permission to do this", 403);
  }
}

function assertAnyPermission(actor, codes) {
  if (!canAny(actor, codes)) {
    throw new AppError("You do not have permission to do this", 403);
  }
}

function deny(res) {
  return res.status(403).json(ApiResponse.error("Forbidden", 403));
}

// Route guard. Place after authMiddleware.
function requirePermission(code) {
  const guard = (req, res, next) => {
    if (!req.user) {
      return res.status(401).json(ApiResponse.error("Unauthorised", 401));
    }
    if (!can(req.user, code)) return deny(res);
    next();
  };
  guard[GUARD_TAG] = { kind: "permission", codes: [code] };
  return guard;
}

// For routes that serve more than one audience — e.g. a ticket thread readable
// by the product team OR the client company's supporters. Prefer a single
// permission where one exists; this is not a licence to widen a route.
function requireAny(...codes) {
  const guard = (req, res, next) => {
    if (!req.user) {
      return res.status(401).json(ApiResponse.error("Unauthorised", 401));
    }
    if (!canAny(req.user, codes)) return deny(res);
    next();
  };
  guard[GUARD_TAG] = { kind: "permission", codes };
  return guard;
}

// For routes whose real authorisation is the caller's ROLE IN THE PROJECT
// (project_members.role: member or team_lead) rather than a platform permission.
//
// Two layers, on purpose:
//   1. this guard, at the route: project.read. It says "you may use projects at
//      all", which is what keeps an external supporter -- who holds no
//      project.read -- out of the product surface entirely. Without it, a route
//      declared project-level would be open to every authenticated principal.
//   2. the service, per project: ProjectService.getProject / assertCanContribute
//      / assertCanManageProject decide what this person may do in THIS project.
//
// It is a declaration, not a promise: nothing here checks that the service did
// its half. That is what the project-level specs are for.
function requireProjectAccess(reason) {
  const guard = (req, res, next) => {
    if (!req.user) {
      return res.status(401).json(ApiResponse.error("Unauthorised", 401));
    }
    if (!can(req.user, "project.read")) return deny(res);
    next();
  };
  guard[GUARD_TAG] = { kind: "project", codes: ["project.read"], reason };
  return guard;
}

// Authenticated, but needs no particular permission — pure self-service
// (your own profile, your own notifications). The service still scopes to
// req.user.id; this only records that the omission is deliberate.
function requireAuthenticatedOnly(reason) {
  const guard = (req, res, next) => {
    if (!req.user) {
      return res.status(401).json(ApiResponse.error("Unauthorised", 401));
    }
    next();
  };
  guard[GUARD_TAG] = { kind: "self", codes: [], reason };
  return guard;
}

// Unauthenticated by design (token-gated public forms, the auth endpoints).
// A no-op at runtime; its job is to satisfy the deny-by-default audit so that
// an UNDECLARED route is always a bug and never a policy.
function publicRoute(reason) {
  const guard = (req, res, next) => next();
  guard[GUARD_TAG] = { kind: "public", codes: [], reason };
  return guard;
}

module.exports = {
  can,
  canAny,
  canAll,
  hasWildcard,
  assertPermission,
  assertAnyPermission,
  requirePermission,
  requireAny,
  requireProjectAccess,
  requireAuthenticatedOnly,
  publicRoute,
  GUARD_TAG,
};
