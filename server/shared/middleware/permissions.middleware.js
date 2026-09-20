// shared/middleware/permissions.middleware.js
// Resolves the caller's effective permissions and attaches them to req.user.
// Runs immediately after authMiddleware on every authenticated route.
//
// Resolution is from the DATABASE, not the access token: the token is long
// lived, and a role edit has to take effect for its members straight away.
// permissionCache.js keeps that from costing a query per request.
const cache = require("../access/permissionCache");
const { ApiResponse } = require("../response/apiResponse");

// Lazily required — the repository builds itself from AppDataSource at import
// time, and this module is imported by routers that load before the DB does.
let repo = null;
function accessRepo() {
  if (!repo) {
    const { AccessRepository } = require("../../modules/access/repositories/access.repository");
    repo = AccessRepository.Instance;
  }
  return repo;
}

async function resolvePermissions(userId) {
  const cached = cache.get(userId);
  if (cached) return cached;
  const codes = await accessRepo().effectivePermissions(userId);
  return cache.set(userId, codes);
}

async function permissionsMiddleware(req, res, next) {
  if (!req.user?.id) {
    return next();
  }
  try {
    req.user.permissions = await resolvePermissions(req.user.id);
    next();
  } catch (err) {
    // A resolver failure must deny, never fall through with no permissions
    // silently treated as "unauthenticated" further down the stack.
    console.error("[access] Failed to resolve permissions:", err.message);
    res
      .status(503)
      .json(ApiResponse.error("Could not verify your permissions, please retry", 503));
  }
}

module.exports = { permissionsMiddleware, resolvePermissions };
