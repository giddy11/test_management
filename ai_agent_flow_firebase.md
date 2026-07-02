# Firebase/Firestore Setup & AI Agent Scaffold Guide

> **Purpose:** This document is the authoritative scaffold guide for introducing Firebase (specifically Firestore) into a project that already has a primary relational database. It is written from a real, first-time setup session — every command, every gotcha, and every dead end here actually happened. Follow it in order; skipping steps is what produces the failures documented in §7.

---

## 1. Core Philosophy

| Principle | Description |
|---|---|
| **Firestore is a realtime fan-out layer, not a replacement database** | Reach for it when a feature specifically needs live updates across open clients (comments, live status, presence, collaborative editing) — not as a general-purpose datastore alongside your existing SQL database. |
| **Server-mediated writes by default** | The server (Admin SDK) is the only writer. Business logic, ownership checks, and moderation stay in your existing service layer — never duplicated into Firestore security rules. Clients only ever open realtime *read* listeners. |
| **Anonymous auth for read access only** | Clients sign in to Firebase anonymously purely to satisfy "must be authenticated to read." This identity is *not* linked to your app's own user/session system — don't try to bridge them unless a feature genuinely needs client-authoritative writes (see §1.1). |
| **Least privilege, always** | Every service account gets exactly one role (`roles/datastore.user`), never `Editor`/`Owner`. Every set of security rules is `allow read: if request.auth != null; allow write: if false;` unless a specific feature needs otherwise. |
| **Verify functionally, not structurally** | "The API returned 200" is not verification. Write a real document through the actual code path, read it back, delete it. See §6.5. |

### 1.1 When to break from "server-mediated writes"

If a feature genuinely needs client-authoritative writes (offline-first editing, direct peer-to-peer-feeling collaboration), the alternative is: bridge your app's own auth into Firebase via **custom tokens** (`admin.auth().createCustomToken(userId)` server-side, `signInWithCustomToken()` client-side), and move ownership/moderation logic into Firestore security rules. This is significantly more setup and duplicates authorization logic in two places (your API layer's rules + Firestore's rules) — only take this path when asked for it specifically, and treat it as a distinct architectural decision requiring the same sign-off as any other (see `ai_agent_flow_backend.md` §18 SOLID/Dependency Inversion — the same principle that makes a repository swap invisible to the service layer is what makes the "server-mediated" default clean).

---

## 2. Setup Checklist — Run in This Order

Every step below is annotated with **[CLI]** (can be scripted/automated) or **[CONSOLE]** (must be done by a human in the Firebase Console — no reliable API path, don't waste time trying to script it).

```
[ ] 1.  [CLI]     Confirm the target GCP project ID. If deploying elsewhere already
                  (Cloud Run, App Engine, etc.), reuse that same project — Firestore
                  is just another API on it, not a new project.
[ ] 2.  [CLI]     Windows only: point CLOUDSDK_PYTHON at gcloud's bundled Python
                  before running anything else (see §7.1) — gcloud will silently
                  fail otherwise.
[ ] 3.  [CLI]     gcloud services enable firestore.googleapis.com --project=<PROJECT>
[ ] 4.  [CLI]     gcloud firestore databases create --project=<PROJECT>
                  --location=<REGION> --type=firestore-native
                  — pick <REGION> to match your existing compute (Cloud Run region,
                  etc.) for latency, unless you need multi-region durability.
[ ] 5.  Design the collection(s): what document shape, what fields are denormalized
                  (Firestore has no JOIN — author names, counts, etc. must be written
                  redundantly at write time; see §4.3 and §4.4).
[ ] 6.  [CLI]     Create composite indexes your queries need:
                  gcloud firestore indexes composite create --project=<PROJECT>
                    --collection-group=<name>
                    --field-config field-path=<f1>,order=ascending
                    --field-config field-path=<f2>,order=ascending
                  Any query combining >1 `where`/`orderBy` on different fields needs
                  one of these — Firestore will refuse the query at runtime with a
                  console link to auto-create it if you skip this step, but doing it
                  ahead of time avoids a broken first deploy.
[ ] 7.  [CONSOLE] Authentication → Get Started. This is NOT the same as enabling a
                  sign-in provider — it's a one-time product initialization with no
                  reliable API equivalent found. Skipping this produces
                  CONFIGURATION_NOT_FOUND (see §7.3).
[ ] 8.  [CONSOLE] Authentication → Sign-in method → enable the provider(s) you need
                  (Anonymous, for the default read-only pattern in §1).
[ ] 9.  [CONSOLE] Project Settings → General → Add app → Web app. Copy the resulting
                  apiKey/authDomain/projectId — these are NOT secret (Firestore
                  access is gated by security rules, not by hiding this config) and
                  go straight into the client's public env vars.
[ ] 10. Write firebase.json, .firebaserc, firestore.rules, firestore.indexes.json
                  at the repo root (templates in §5).
[ ] 11. [CLI]     firebase login (confirm it's the account with access to the
                  project — `firebase projects:list` to check; a stale login to an
                  unrelated account is a common silent failure, see §7.4)
                  firebase deploy --only firestore:rules,firestore:indexes
[ ] 12. [CLI]     Create a least-privilege service account for local dev:
                  gcloud iam service-accounts create <name>-dev --project=<PROJECT>
                  gcloud projects add-iam-policy-binding <PROJECT>
                    --member=serviceAccount:<name>-dev@<PROJECT>.iam.gserviceaccount.com
                    --role=roles/datastore.user
                  gcloud iam service-accounts keys create <tmpfile> --iam-account=...
                  — then move the key into your local env config (§7.6) and delete
                  the temp file. NEVER reuse a deploy/CI service account key for
                  this — different blast radius, different lifecycle.
[ ] 13. [CLI]     Grant the SAME role to your deployed runtime's service account
                  (Cloud Run's default is the Compute Engine default SA unless you
                  configured a custom one — `gcloud run services describe <name>
                  --region=<region> --format="value(spec.template.spec.serviceAccountName)"`
                  to find it). No key file needed there — Application Default
                  Credentials via the metadata server picks it up automatically.
[ ] 14. Wire env vars — server: FIREBASE_PROJECT_ID + FIREBASE_SERVICE_ACCOUNT_JSON
                  (local dev only; unset on the deployed platform so ADC is used).
                  Client: VITE_FIREBASE_API_KEY / VITE_FIREBASE_AUTH_DOMAIN /
                  VITE_FIREBASE_PROJECT_ID (or your framework's env prefix).
[ ] 15. Verify functionally end-to-end (§6.5) before considering this done.
```

---

## 3. Architecture Pattern (Server-Mediated Writes)

```
Write path:
  Client -> your existing REST/API endpoint -> your existing service layer
           (ownership/moderation/business logic — UNCHANGED)
         -> repository writes to Firestore via Admin SDK
           (Admin SDK bypasses security rules entirely)

Read path:
  Client -> anonymous Firebase sign-in (once, cached)
         -> onSnapshot() realtime listener directly against Firestore
           (gated only by security rules: read if authenticated, write: false)
```

The repository swap is the whole trick: give the Firestore-backed repository **the exact same method signatures** (`fetchPaginated`, `findById`, `create`, `softDelete`, …) as whatever repository it's replacing. The service layer above it doesn't change at all — this is Dependency Inversion, not a special case.

---

## 4. Server-Side Code Patterns

### 4.1 The Firestore client — lazy singleton with a credential guard

```js
// infrastructure/firestore/firestoreClient.js
const os = require("os");
const path = require("path");
const fs = require("fs");
const { initializeApp, applicationDefault, cert, getApps } = require("firebase-admin/app");
const { getFirestore: getFirestoreInstance, FieldValue } = require("firebase-admin/firestore");
const { env } = require("../../config/env");

let firestore = null;

// gcloud auth application-default login writes here — the Google Auth Library
// checks this path even without GOOGLE_APPLICATION_CREDENTIALS set.
function hasLocalAdcFile() {
  const base = process.platform === "win32"
    ? path.join(process.env.APPDATA || "", "gcloud")
    : path.join(os.homedir(), ".config", "gcloud");
  return fs.existsSync(path.join(base, "application_default_credentials.json"));
}

// K_SERVICE is set automatically on Cloud Run (and similar) — the metadata-server
// credential path only actually works there, never on a developer machine.
function isConfigured() {
  return Boolean(
    env.firebase.serviceAccountJson ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      process.env.K_SERVICE ||
      hasLocalAdcFile()
  );
}

// CRITICAL — see §7.2. Without this guard, calling applicationDefault() with no
// credential source available fails deep inside the SDK's gRPC channel setup via a
// promise that ISN'T part of the awaited call chain — it crashes the whole process
// as an unhandled rejection instead of rejecting your write/read call. Failing
// synchronously here, before the SDK is ever touched, is what makes a normal
// try/catch around your repository calls actually reliable.
function getFirestore() {
  if (!isConfigured()) {
    throw new Error("Firestore is not configured — set FIREBASE_SERVICE_ACCOUNT_JSON or run where ADC is available");
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
```

**Note the import style**: `require("firebase-admin/firestore")` and `require("firebase-admin/app")`, not `require("firebase-admin")` then `admin.firestore.FieldValue` — modern `firebase-admin` (v12+) doesn't populate that legacy namespaced shape by default. Using it throws `Cannot read properties of undefined (reading 'FieldValue')` at require time.

### 4.2 Repository pattern — every method wrapped, credential errors surfaced as a normal domain error

```js
function unavailable(err) {
  console.error("[myFeature] Firestore error:", err.message);
  return new AppError("This feature is temporarily unavailable", 503);
}

class MyFirestoreRepository {
  async create(data) {
    try {
      const ref = await getFirestore().collection(COLLECTION).add({ ...data, createdAt: FieldValue.serverTimestamp() });
      return toDomainObject(await ref.get());
    } catch (err) {
      throw unavailable(err);
    }
  }
  // findById / fetchPaginated / softDelete follow the same try/catch shape
}
```

### 4.3 No joins — denormalize at write time

Firestore documents can't join to a `users` table. If the client needs a display name, resolve it in the service (which already has the actor/user context for other reasons — auth checks, notifications) and write it onto the document directly:

```js
const author = await this.authRepo.findUserById(actor.id);
await this.repo.create({ authorId: actor.id, authorName: [author.firstName, author.lastName].filter(Boolean).join(" "), ... });
```

### 4.4 Counts — denormalize on the SQL side, not Firestore aggregation queries

If a list view needs "N comments" per row and the rows live in your primary SQL database, don't run a Firestore aggregation query per row. Add a plain denormalized counter column (`comment_count integer default 0`) to the SQL row, and increment/decrement it from the service right after each successful Firestore write:

```js
await this.commentRepo.create({ ... });          // Firestore write
await this.parentRepo.incrementCommentCount(id);  // plain SQL UPDATE ... SET count = count + 1
```

This is **eventually consistent**, not atomic (they're different databases — no single transaction spans both). Document this tradeoff inline; it's a deliberate choice, not an oversight.

---

## 5. Client-Side Code Patterns

### 5.1 The Firestore client — single instance, anonymous auth

```ts
// lib/firestore.ts
import { initializeApp } from "firebase/app"
import { getFirestore } from "firebase/firestore"
import { getAuth, signInAnonymously } from "firebase/auth"

const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
})
export const db = getFirestore(app)

let signInPromise: Promise<void> | null = null
export function ensureFirebaseAuth(): Promise<void> {
  if (!signInPromise) signInPromise = signInAnonymously(getAuth(app)).then(() => undefined)
  return signInPromise
}
```

### 5.2 Realtime hook — subscribe on mount, clean up on unmount

```ts
export function useLiveComments(parentId: string) {
  const [data, setData] = useState<Comment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isError, setIsError] = useState(false)

  useEffect(() => {
    if (!parentId) return
    let unsubscribe: (() => void) | undefined
    let cancelled = false

    ensureFirebaseAuth()
      .then(() => {
        if (cancelled) return
        const q = query(
          collection(db, "comments"),
          where("parentId", "==", parentId),
          where("deletedAt", "==", null),
          orderBy("createdAt", "asc")
        )
        unsubscribe = onSnapshot(q, (snap) => { setData(snap.docs.map(toComment)); setIsLoading(false) },
          () => { setIsError(true); setIsLoading(false) })
      })
      .catch(() => { setIsError(true); setIsLoading(false) })

    return () => { cancelled = true; unsubscribe?.() }
  }, [parentId])

  return { data, isLoading, isError }
}
```

Mutations (create/delete) still go through your normal API endpoints — don't call Firestore write methods from the client at all under the server-mediated pattern. The realtime listener picks up the change on its own once the server writes it; you generally don't need to manually invalidate/refetch the list after a successful mutation, only any denormalized counters shown elsewhere (§4.4).

---

## 6. Config File Templates

### 6.1 `firebase.json`
```json
{ "firestore": { "rules": "firestore.rules", "indexes": "firestore.indexes.json" } }
```

### 6.2 `.firebaserc`
```json
{ "projects": { "default": "<PROJECT_ID>" } }
```

### 6.3 `firestore.rules` — default server-mediated pattern
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /<collection>/{docId} {
      allow read: if request.auth != null;
      allow write: if false;   // Admin SDK bypasses rules entirely — this blocks clients only
    }
  }
}
```

### 6.4 `firestore.indexes.json`
```json
{
  "indexes": [
    {
      "collectionGroup": "<collection>",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "<parentId>", "order": "ASCENDING" },
        { "fieldPath": "deletedAt", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "ASCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

### 6.5 Functional verification — run this before calling the setup done

Structural checks (API enabled, database exists, IAM binding present) are necessary but not sufficient. Prove the actual write→read→delete path works through your real code, and clean up after yourself:

```js
const repo = MyFirestoreRepository.Instance;
const doc = await repo.create({ /* throwaway test data */ });
console.log('Write OK:', doc.id);
const fetched = await repo.findById(doc.id);
console.log('Read-back OK:', Boolean(fetched));
await repo.softDelete(doc.id);
await getFirestore().collection(COLLECTION).doc(doc.id).delete(); // fully remove, don't leave test data
console.log('Verified end-to-end.');
```

---

## 7. Known Gotchas (all observed firsthand — read before you hit them)

### 7.1 `gcloud` on Windows: "Python was not found"
Symptom: any `gcloud` command triggers a Microsoft Store Python install prompt instead of running. Fix: point `CLOUDSDK_PYTHON` at the SDK's own bundled interpreter before running anything:
```bash
export CLOUDSDK_PYTHON="<path-to-cloud-sdk>/platform/bundledpython/python.exe"
```

### 7.2 Server crashes (not a clean error) on the first Firestore write with no credentials configured
Symptom: `Error: Could not load the default credentials` followed by an **uncaught exception that kills the Node process**, even though the write call was wrapped in try/catch. Root cause: `applicationDefault()`'s failure path, when no ADC source exists at all, rejects via a promise deep inside `google-gax`'s gRPC channel setup that isn't part of your awaited call chain — Node treats it as an unhandled rejection, not a normal rejected promise. Fix: the synchronous credential-source guard in §4.1's `getFirestore()` — never let the SDK attempt credential resolution when you already know (from env vars / well-known file paths) that nothing is configured.

### 7.3 `CONFIGURATION_NOT_FOUND` on `signInAnonymously()` / any Identity Toolkit call
Means Firebase Authentication was never initialized for the project at all — not just "the provider isn't enabled," the whole product has no config. `identitytoolkit.googleapis.com` being *enabled* is not sufficient; a plain `GET .../v2/projects/<id>/config` will 404 with this exact message. No reliable API-only fix was found — this needs the Console's Authentication → "Get Started" button once, then the Sign-in method tab to enable specific providers.

### 7.4 Firebase CLI deploys silently target the wrong project / fail with access errors
`firebase login` can be signed into a completely different Google account than the one with access to your target project (easy to not notice — the CLI doesn't warn you). Check with `firebase projects:list` before deploying; re-run `firebase login` with the correct account if your project isn't in the list.

### 7.5 IAM grants and rules deploys need explicit, specific confirmation — every time
If you're an AI agent with access to cloud credentials: expect a safety layer to block IAM policy grants (`add-iam-policy-binding`) and security-rule deployments even after general authorization like "use gcloud" or "go ahead" — these are treated as high-severity because they're persistent changes to a shared/production-adjacent resource. Read-only checks (list, describe, get-iam-policy) and low-risk creates (enabling an API, creating a service account with zero permissions yet) generally don't need this. Before attempting an IAM grant or rules deploy, state the *exact* command/role/resource and get a direct confirmation on that specific action — a confirmation from two turns earlier on a generic description doesn't count.

### 7.6 Never let a raw service-account key pass through a chat/log transcript
Generate keys to a local temp file, transform/insert them into your env config via a script (not by you reading and retyping the value), then delete the temp file. If you need to verify the key was written correctly, check non-secret metadata (`client_email`, `project_id`, byte length) — never print `private_key`.

---

## 8. AI Agent Mandatory Rules

AI agents setting up Firebase/Firestore in a new project MUST:
- Follow the checklist in §2 in order — Console-only steps (Auth init, provider enable, Web app registration) cannot be scripted; don't spend time trying.
- Use the credential-guard pattern in §4.1 for every Firestore client — a bare `applicationDefault()` call with no guard is a known crash waiting to happen (§7.2).
- Give every service account exactly one role (`roles/datastore.user` for Firestore-only access) — never `Editor`/`Owner`, never reuse a deploy/CI credential for app runtime access.
- Verify functionally (§6.5) before reporting the setup as complete — a 200 response from an "enable API" call is not proof anything actually works.
- Get specific, per-action confirmation before IAM grants or rules deployments (§7.5) — don't treat earlier general authorization as covering these.
- Keep write-path business logic (ownership, moderation, validation) in the existing service layer — never move it into Firestore security rules under the server-mediated pattern.

AI agents MUST NOT:
- Print a raw service-account key's contents into a chat transcript, log, or any non-gitignored file (§7.6).
- Assume `gcloud services enable` succeeding means the *product* is usable — Firestore needs a database created (§2 step 4), Authentication needs Console init (§7.3) regardless of API enablement.
- Attempt to script Console-only steps via improvised/undocumented REST calls against a live project without explicit, specific sign-off first.
- Let the client SDK write directly to Firestore under the server-mediated pattern (§1) unless the project has explicitly chosen the custom-token/client-authoritative alternative (§1.1).

---

## 9. Final Principle

> **"Firestore fans out reads in realtime. Your existing service layer still owns every write decision. Security rules are a backstop, not a rulebook. Verify by doing, not by checking a box."**
