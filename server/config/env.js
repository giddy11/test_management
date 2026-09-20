// config/env.js
// Central, typed access point for all environment variables.
// Nothing else in the codebase reads process.env directly.
require("dotenv").config();

function required(key, fallback) {
  const value = process.env[key] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function bool(key, fallback = false) {
  const value = process.env[key];
  if (value === undefined) return fallback;
  return value === "true" || value === "1";
}

const isProduction = process.env.NODE_ENV === "production";

// How outgoing email is delivered: Gmail SMTP via Nodemailer, or a Google Apps
// Script web app. Fail fast on a typo — silently falling back would send mail
// through a different channel than the one the operator asked for.
const EMAIL_PROVIDERS = ["nodemailer", "script"];
const emailProvider = (process.env.EMAIL_PROVIDER || "nodemailer").trim().toLowerCase();
if (!EMAIL_PROVIDERS.includes(emailProvider)) {
  throw new Error(
    `Invalid EMAIL_PROVIDER "${process.env.EMAIL_PROVIDER}" — expected one of: ${EMAIL_PROVIDERS.join(", ")}`
  );
}

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  isProduction,
  port: Number(process.env.PORT || 4000),
  corsOrigins: (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),

  db: {
    host: required("DB_HOST", "localhost"),
    port: Number(process.env.DB_PORT || 5432),
    username: required("DB_USERNAME", "postgres"),
    password: required("DB_PASSWORD", "postgres"),
    // Accept either DB_NAME or DB_DATABASE.
    database: process.env.DB_NAME || required("DB_DATABASE", "testmate"),
    // Optional schema override; defaults to the connection default (public).
    schema: process.env.DB_SCHEMA || undefined,
    // Auto-create schema in development; always opt-in via env for production.
    synchronize: bool("DB_SYNCHRONIZE", !isProduction),
    logging: bool("DB_LOGGING", false),
    ssl: bool("DB_SSL", false),
  },

  jwt: {
    // Accept either JWT_ACCESS_SECRET or JWT_SECRET.
    accessSecret:
      process.env.JWT_ACCESS_SECRET || required("JWT_SECRET", "dev-access-secret"),
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
    refreshSecret: required("JWT_REFRESH_SECRET", "dev-refresh-secret"),
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
  },

  email: {
    // "nodemailer" (uses user/password) or "script" (uses scriptUrl).
    provider: emailProvider,
    user: process.env.EMAIL_USER || "",
    password: process.env.EMAIL_PASSWORD || "",
    from: process.env.EMAIL_FROM || "TestMate <no-reply@testmate.app>",
    // Google Apps Script web-app /exec URL. Treat as a secret: anyone who has
    // it can send mail as the script owner. Ignored unless provider is "script".
    scriptUrl: process.env.EMAIL_SCRIPT_URL || "",
  },

  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || "",
    apiKey: process.env.CLOUDINARY_API_KEY || "",
    apiSecret: process.env.CLOUDINARY_API_SECRET || "",
  },

  // Firestore — realtime feature-request comments. On Cloud Run, leave
  // serviceAccountJson unset and grant the runtime service account
  // roles/datastore.user so Application Default Credentials apply instead.
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID || "",
    serviceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "",
  },

  // Used to build links in emails (e.g. password reset). Falls back to the API host.
  appBaseUrl: process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 4000}`,
  // Frontend URL — used for email links that open the UI (e.g. login button).
  appUrl: process.env.URL || `http://localhost:5173`,

  // Minutes an emailed OTP stays valid (email verification, password reset —
  // these gate real account actions, so they stay short-lived).
  otpTtlMinutes: Number(process.env.OTP_TTL_MINUTES || 15),
  // Minutes a "my tickets" lookup code stays valid. Read-only access to your
  // own ticket history, not an account action, so this is deliberately much
  // longer-lived than otpTtlMinutes — long enough that checking back on a
  // ticket days later doesn't mean emailing yourself a new code every time.
  // Default 7 days.
  ticketLookupCodeTtlMinutes: Number(process.env.TICKET_LOOKUP_CODE_TTL_MINUTES || 7 * 24 * 60),
};

module.exports = { env };
