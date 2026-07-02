// infrastructure/firestore/firestoreClient.js
// Lazy singleton — a missing/misconfigured credential must not crash the whole
// server at boot, only the Firestore-backed features (feature-request comments).
const os = require("os");
const path = require("path");
const fs = require("fs");
const { initializeApp, applicationDefault, cert, getApps } = require("firebase-admin/app");
const { getFirestore: getFirestoreInstance, FieldValue } = require("firebase-admin/firestore");
const { env } = require("../../config/env");

let firestore = null;

// The well-known path `gcloud auth application-default login` writes to — checked
// because the Google Auth Library falls back to it even without
// GOOGLE_APPLICATION_CREDENTIALS set.
function hasLocalAdcFile() {
  const base =
    process.platform === "win32"
      ? path.join(process.env.APPDATA || "", "gcloud")
      : path.join(os.homedir(), ".config", "gcloud");
  return fs.existsSync(path.join(base, "application_default_credentials.json"));
}

// Cloud Run (and most GCP compute) sets K_SERVICE — the metadata-server credential
// path only actually works there, never on a developer machine.
function isConfigured() {
  return Boolean(
    env.firebase.serviceAccountJson ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      process.env.K_SERVICE ||
      hasLocalAdcFile()
  );
}

// IMPORTANT: without this guard, calling applicationDefault() with no credential
// source available fails deep inside google-gax's gRPC channel setup via a promise
// that ISN'T part of the awaited call chain — it surfaces as an unhandled rejection
// that crashes the whole Node process instead of rejecting the write/read call. Failing
// synchronously here, before the SDK is ever touched, is what makes the repository's
// try/catch (-> AppError 503) actually reliable.
function getFirestore() {
  if (!isConfigured()) {
    throw new Error(
      "Firestore is not configured — set FIREBASE_SERVICE_ACCOUNT_JSON (local dev) or run on Cloud Run with roles/datastore.user granted"
    );
  }
  if (firestore) return firestore;

  if (!getApps().length) {
    initializeApp({
      credential: env.firebase.serviceAccountJson
        ? cert(JSON.parse(env.firebase.serviceAccountJson))
        : applicationDefault(),
      projectId: env.firebase.projectId || undefined,
    });
  }

  firestore = getFirestoreInstance();
  return firestore;
}

module.exports = { getFirestore, FieldValue };
