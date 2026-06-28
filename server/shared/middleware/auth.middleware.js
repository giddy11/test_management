// shared/middleware/auth.middleware.js
// Verifies the access token and attaches the decoded payload to req.user.
const { verifyAccessToken } = require("../utils/jwt");
const { ApiResponse } = require("../response/apiResponse");

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json(ApiResponse.error("Unauthorised", 401));
  }

  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    res.status(401).json(ApiResponse.error("Token invalid or expired", 401));
  }
}

module.exports = { authMiddleware };
