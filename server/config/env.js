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
    user: process.env.EMAIL_USER || "",
    password: process.env.EMAIL_PASSWORD || "",
    from: process.env.EMAIL_FROM || "TestMate <no-reply@testmate.app>",
  },

  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || "",
    apiKey: process.env.CLOUDINARY_API_KEY || "",
    apiSecret: process.env.CLOUDINARY_API_SECRET || "",
  },

  // Used to build links in emails (e.g. password reset). Falls back to the API host.
  appBaseUrl: process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 4000}`,
  // Frontend URL — used for email links that open the UI (e.g. login button).
  appUrl: process.env.URL || `http://localhost:5173`,

  // Minutes an emailed OTP stays valid.
  otpTtlMinutes: Number(process.env.OTP_TTL_MINUTES || 15),
};

module.exports = { env };
