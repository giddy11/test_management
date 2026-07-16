// shared/middleware/rateLimiter.middleware.js
const rateLimit = require("express-rate-limit");
const { ApiResponse } = require("../response/apiResponse");

function buildLimiter({ windowMs, max, message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json(ApiResponse.error(message, 429));
    },
  });
}

// Tighter limit for auth endpoints (login/register/refresh) to slow brute force.
const authRateLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Too many requests, please try again later",
});

// General API limiter.
const apiRateLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: "Too many requests, please try again later",
});

module.exports = { authRateLimiter, apiRateLimiter, buildLimiter };
