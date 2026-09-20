// shared/middleware/auth.middleware.js
// Verifies the access token, attaches the decoded payload to req.user, then
// resolves the caller's effective permissions onto it.
//
// Permissions are resolved from the database rather than read off the token:
// the token is long lived, and editing a role has to take effect for its
// members immediately. See shared/access/permissionCache.js.
const { verifyAccessToken } = require("../utils/jwt");
const { ApiResponse } = require("../response/apiResponse");
const { permissionsMiddleware } = require("./permissions.middleware");

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json(ApiResponse.error("Unauthorised", 401));
  }

  try {
    req.user = verifyAccessToken(token);
  } catch {
    return res.status(401).json(ApiResponse.error("Token invalid or expired", 401));
  }

  // Never fall through to the handler with permissions unresolved — can() then
  // denies everything, but permissionsMiddleware answers 503 rather than a
  // misleading 403.
  permissionsMiddleware(req, res, next);
}

module.exports = { authMiddleware };
