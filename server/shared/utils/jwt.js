// shared/utils/jwt.js
// Owns all JWT signing/verification. Services depend on these helpers, not jsonwebtoken.
const jwt = require("jsonwebtoken");
const { env } = require("../../config/env");

function signAccessToken(payload) {
  return jwt.sign(payload, env.jwt.accessSecret, {
    expiresIn: env.jwt.accessExpiresIn,
  });
}

function signRefreshToken(payload) {
  return jwt.sign(payload, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshExpiresIn,
  });
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.jwt.accessSecret);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, env.jwt.refreshSecret);
}

// Access-token lifetime in seconds — returned to clients as `expiresIn`.
function accessTokenTtlSeconds() {
  const value = env.jwt.accessExpiresIn;
  const match = /^(\d+)([smhd])?$/.exec(String(value).trim());
  if (!match) return 900;
  const amount = Number(match[1]);
  const unit = match[2] || "s";
  const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
  return amount * multipliers[unit];
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  accessTokenTtlSeconds,
};
