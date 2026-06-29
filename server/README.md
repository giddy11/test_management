# TestMate — Server

Test Case Management API. PERN stack — **Express · TypeORM · PostgreSQL · Node.js** (JavaScript / CommonJS).

Built to the layered standard: `Validation → Auth → Authorise → Controller → Service → Repository → Entity → DB`, with a single `ApiResponse` envelope on every route.

## Stack & layout

```
server/
├── config/                  env + shared enum constants
├── infrastructure/database/ TypeORM DataSource (all entities registered here)
├── shared/                  ApiResponse, AppError, middleware, jwt/password utils, pagination
└── modules/
    ├── auth/                register · login · refresh · logout · google · me
    ├── project/             CRUD
    ├── testSuite/           CRUD (scoped to a project)
    ├── testCase/            CRUD (scoped to a suite, PG-array steps/tags)
    ├── testRun/             create snapshots the suite's cases; status summary
    └── testRunResult/       list / record pass·fail·blocked·skipped per case
```

Each module owns `entities/ validators/ dto/ repositories/ services/ controllers/ routes/`.
Entities are defined with TypeORM **`EntitySchema`** (no decorators / no build step) and are imported only by their repository.

## Getting started

```bash
npm install
cp .env.example .env   # then fill in real values
npm run dev            # nodemon
# or
npm start
```

### Database
Set the `DB_*` vars in `.env`. In development `synchronize` is on by default (auto-creates
tables); set `DB_SYNCHRONIZE=false` and use migrations in production
(`npm run migration:generate`, `migration:run`). `DB_SCHEMA` is optional (defaults to `public`).

## Auth

| Method | Route | Auth | Body |
|---|---|---|---|
| POST | `/api/v1/auth/register` | – | `firstName, lastName, companyName, email, password` + optional `address, city, state, country` |
| POST | `/api/v1/auth/login` | – | `email, password` |
| POST | `/api/v1/auth/refresh` | – | `refreshToken` (rotated on use) |
| POST | `/api/v1/auth/logout` | ✓ | `refreshToken` |
| POST | `/api/v1/auth/google` | – | `idToken` (Google ID token) |
| POST | `/api/v1/auth/verify-email` | – | `email, code` |
| POST | `/api/v1/auth/resend-verification` | – | `email` |
| POST | `/api/v1/auth/forgot-password` | – | `email` |
| POST | `/api/v1/auth/reset-password` | – | `email, code, newPassword` |
| GET  | `/api/v1/auth/me` | ✓ | – |

- **Registration** is for an organisation user: first/last name + company name (+ optional
  address). The account is created **unverified** and a 6-digit code is emailed; tokens are still
  returned so the app is usable, and `user.isEmailVerified` reflects the state. `verify-email`
  flips it to true.
- **Access token** 15 min (Bearer header). **Refresh token** 7 days — only its SHA-256 hash is
  stored in `refresh_tokens`; refresh rotates (old token is revoked).
- **Email verification & password reset** use one-time codes stored as SHA-256 hashes in
  `otp_codes` (TTL `OTP_TTL_MINUTES`). `forgot-password` never reveals whether an email exists.
- **Google Sign In** verifies the ID token with `google-auth-library`, then upserts the user
  (links to an existing email account if present; marks email verified). Requires `GOOGLE_CLIENT_ID`.
- New accounts default to role `admin` (V1 has no RBAC UI — see spec §15.2).

## Integrations
- **Cloudinary** (`infrastructure/storage/cloudinaryClient.js` + `shared/services/storage.service.js`)
  — image uploads. Configured via `CLOUDINARY_*`. Used by test-case attachments.
- **Email** (`shared/utils/mailer.js`) — Gmail SMTP via Nodemailer, one `emailLayout()` brand
  wrapper. Sends are fire-and-forget so a mail failure never breaks a request.

## Test-case attachments (images)
| Method | Route | Notes |
|---|---|---|
| POST | `/api/v1/test-cases/:id/attachments` | multipart, field `images`, ≤10 files, ≤5 MB each, PNG/JPEG/WebP |
| GET  | `/api/v1/test-cases/:id/attachments` | list |
| DELETE | `/api/v1/test-cases/:id/attachments/:attachmentId` | removes from Cloudinary + DB |

Uploads stream straight to Cloudinary (memory only, never disk); both the URL and Cloudinary
`publicId` are persisted so assets can be deleted.

## Resource CRUD

All list endpoints are paginated (`?page&limit`) and return `meta`. Writes are guarded by
`authorise(...)`. Soft delete on projects / suites / cases.

| Resource | Base | List filter |
|---|---|---|
| Projects | `/api/v1/projects` | `search` |
| Test Suites | `/api/v1/test-suites` | `projectId` (required) |
| Test Cases | `/api/v1/test-cases` | `suite` (required), `search` |
| Test Runs | `/api/v1/test-runs` | `projectId` (required) |
| Run Results | `/api/v1/test-run-results` | `runId` (required), `status` |

Creating a **test run** snapshots every case in the suite into pending `test_run_results`.
`GET /test-runs/:id` returns a `summary` of pass/fail/blocked/skipped counts.

## Deployment (Google Cloud Run)

Containerised via the `Dockerfile` (Node 22, prod deps only, listens on `$PORT`/8080).

**One-time project setup** (run in your shell, authenticated as the project owner):
```bash
gcloud config set project testmate-f973c
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
# Cloud Run + Cloud Build require billing enabled on the project.
```

**Deploy** (from `server/`):
```bash
cp deploy.env.example.yaml deploy.env.yaml   # fill in real secrets (gitignored)
npm run deploy
# = gcloud run deploy testmate-api --source . --region us-central1 \
#     --allow-unauthenticated --env-vars-file deploy.env.yaml
```
`--source .` builds the image with Cloud Build and deploys. Prefer **Secret Manager**
(`--set-secrets`) over the env file for production secrets.

Notes:
- In production `NODE_ENV=production` ⇒ `synchronize` is **off**. The schema is already created
  on the dedicated DB; for a fresh DB run migrations or set `DB_SYNCHRONIZE=true` for the first
  deploy only.
- Set `CORS_ORIGINS` to your deployed frontend origin(s).
- `cloudbuild.yaml` is provided for a push-triggered pipeline (optional).

## CI/CD — auto-deploy on push (Cloud Run continuous deployment)

Cloud Run's built-in continuous deployment connects the GitHub repo and creates a Cloud Build
trigger that builds `server/Dockerfile` and deploys on every push to `main`.

**Prerequisite — grant Cloud Build's default SA the builder role** (PowerShell):
```powershell
gcloud projects add-iam-policy-binding testmate-f973c --member="serviceAccount:456203711303-compute@developer.gserviceaccount.com" --role="roles/cloudbuild.builds.builder"
```

**Set up (console):** Cloud Run → service `testmate-api` → **Set up continuous deployment**:
1. **Repository provider:** GitHub → authorize → install the *Google Cloud Build* app on
   `giddy11/test_management`.
2. **Branch:** `^main$`
3. **Build type:** Dockerfile · **Source location:** `/server/Dockerfile`
   (build context becomes `/server`).
4. Save — accept the prompt to grant the trigger's service account the required roles.

Notes:
- Do one `npm run deploy` **first** so the service has a working revision + env vars; the trigger
  preserves env vars across builds (it doesn't set them).
- Manage production secrets with **Secret Manager** rather than plaintext env when you're ready.
- This is mutually exclusive with a GitHub Actions deploy workflow — run only one.

## Not yet implemented (next steps)
Attachments upload (multer + storage), the XLSX template download + 4-step import flow,
and a dashboard endpoint — all specced in `ai_agent_flow_backend.md` / `TestMate-Spec.docx`.
