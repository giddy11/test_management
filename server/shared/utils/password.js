// shared/utils/password.js
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const SALT_ROUNDS = 12;

async function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

async function comparePassword(plain, hash) {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}

// Refresh tokens and OTP codes are stored as a SHA-256 hash — never the raw value.
function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// Partner integration API keys: a prefixed, high-entropy bearer secret shown
// once at generation/rotation. Only its hashToken() hash is ever persisted.
function generateApiKey() {
  return `tmk_${crypto.randomBytes(32).toString("base64url")}`;
}

// Cryptographically-random N-digit numeric one-time code (default 6 digits).
function generateOtp(digits = 6) {
  const max = 10 ** digits;
  const n = crypto.randomInt(0, max);
  return String(n).padStart(digits, "0");
}

// One-off password for an account TestMate creates on someone else's behalf
// (e.g. a provisioned IT support lead) — emailed once via the invite, never
// shown in any UI. Satisfies createSupporterSchema's policy (8+ chars, an
// uppercase letter, a digit) so it'd also pass if ever submitted through that
// same form.
function generateTempPassword() {
  const body = crypto.randomBytes(9).toString("base64url"); // ~12 chars, mixed case
  return `Tm1${body}`;
}

module.exports = {
  hashPassword,
  comparePassword,
  hashToken,
  generateOtp,
  generateApiKey,
  generateTempPassword,
};
