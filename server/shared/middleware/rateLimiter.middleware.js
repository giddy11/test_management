// shared/middleware/rateLimiter.middleware.js
const rateLimit = require("express-rate-limit");
const { ApiResponse } = require("../response/apiResponse");

function buildLimiter({ windowMs, max, message, keyGenerator }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    ...(keyGenerator ? { keyGenerator } : {}),
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

// Routes that spend AI provider money (drafts) or call the provider (listing a
// key's models). Keyed by user, so a shared office IP doesn't pool everyone's
// allowance — place it AFTER authMiddleware so req.user is set. Falls back to
// the IP (the library's own default key) when there is no user.
const aiRateLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: "You've made a lot of AI requests. Please wait a few minutes and try again.",
  keyGenerator: (req) => (req.user?.id ? `user:${req.user.id}` : `ip:${req.ip}`),
});

module.exports = { authRateLimiter, apiRateLimiter, aiRateLimiter, buildLimiter };
