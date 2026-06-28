// shared/middleware/authorise.middleware.js
// Role guard. Place after authMiddleware on write/sensitive routes.
const { ApiResponse } = require("../response/apiResponse");

const authorise =
  (...roles) =>
  (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json(ApiResponse.error("Forbidden", 403));
    }
    next();
  };

module.exports = { authorise };
