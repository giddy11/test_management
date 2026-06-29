# Auto-Deploy to Google Cloud Run (CI/CD Setup)

How this project auto-deploys the API to **Google Cloud Run** on every push to `main`,
and how to replicate it for any other project.

---

## How it works (the flow)

```
git push origin main
      │
      ▼
GitHub Actions (.github/workflows/deploy.yml)
      │  1. checkout code
      │  2. install gcloud CLI
      │  3. authenticate with a GCP service-account key (stored as a GitHub secret)
      │  4. docker build the server image
      │  5. docker push to Google Container Registry (gcr.io)
      │  6. gcloud run deploy  ──►  Cloud Run pulls the new image, swaps traffic
      ▼
Live at https://<service>-<hash>.<region>.run.app
```

Three pieces make this work:

1. **`server/Dockerfile`** – builds the container image.
2. **`.github/workflows/deploy.yml`** – the GitHub Actions pipeline (the auto part).
3. **A GCP service-account key** stored as a GitHub repo secret (named `LABAFOOD` here).

Environment variables / secrets for the running app are managed **separately** on Cloud
Run itself (via `env.yaml`), **not** through the pipeline.

---

## This project's specifics

| Thing | Value |
|---|---|
| GCP Project ID | `labafoods-cf6a9` |
| Region | `europe-west1` |
| Cloud Run service | `labafood-api` |
| Image | `gcr.io/labafoods-cf6a9/labafood-api` |
| GitHub secret holding the SA key | `LABAFOOD` |
| Trigger | push to `main` |

---

## The files

### 1. `server/Dockerfile` — multi-stage build

```dockerfile
# Stage 1: build (installs all deps, compiles TS -> dist)
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Stage 2: production (only prod deps + compiled output = small image)
FROM node:20-alpine AS production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
EXPOSE 8080
CMD ["node", "dist/server.js"]
```

> **Important:** Cloud Run sends traffic to the port in `$PORT` (default **8080**).
> Your server must listen on `process.env.PORT || 8080`.

### 2. `.github/workflows/deploy.yml` — the pipeline

```yaml
name: Deploy to Cloud Run

on:
  push:
    branches: [main]

env:
  PROJECT_ID: labafoods-cf6a9
  REGION: europe-west1
  SERVICE: labafood-api
  IMAGE: gcr.io/labafoods-cf6a9/labafood-api

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v2

      - name: Authenticate to Google Cloud
        run: |
          echo '${{ secrets.LABAFOOD }}' > /tmp/sa-key.json
          gcloud auth activate-service-account --key-file=/tmp/sa-key.json
          gcloud config set project $PROJECT_ID

      - name: Configure Docker for GCR
        run: gcloud auth configure-docker --quiet

      - name: Build and push image
        working-directory: server          # build context = the server/ folder
        run: |
          docker build -t $IMAGE:${{ github.sha }} -t $IMAGE:latest .
          docker push $IMAGE:${{ github.sha }}
          docker push $IMAGE:latest

      - name: Deploy to Cloud Run
        run: |
          gcloud run deploy $SERVICE \
            --image $IMAGE:${{ github.sha }} \
            --platform managed \
            --region $REGION \
            --allow-unauthenticated
```

### 3. `server/env.yaml` — runtime secrets (NOT committed)

Holds the live env vars (DB creds, JWT secrets, API keys, etc.). It is **gitignored**
and applied to Cloud Run manually, separate from the pipeline:

```bash
gcloud run services update labafood-api \
  --env-vars-file env.yaml \
  --region europe-west1
```

---

## Replicate this for a NEW project — step by step

### A. One-time GCP setup (per GCP project)

```bash
# 1. Create / pick a GCP project and note the PROJECT_ID
gcloud projects create my-new-project        # or use an existing one
gcloud config set project my-new-project

# 2. Enable the required APIs
gcloud services enable run.googleapis.com \
                       containerregistry.googleapis.com \
                       cloudbuild.googleapis.com

# 3. Create a service account for GitHub Actions
gcloud iam service-accounts create github-deployer \
  --display-name="GitHub Actions Deployer"

# 4. Grant it the roles it needs
SA="github-deployer@my-new-project.iam.gserviceaccount.com"
gcloud projects add-iam-policy-binding my-new-project \
  --member="serviceAccount:$SA" --role="roles/run.admin"
gcloud projects add-iam-policy-binding my-new-project \
  --member="serviceAccount:$SA" --role="roles/storage.admin"        # push to GCR
gcloud projects add-iam-policy-binding my-new-project \
  --member="serviceAccount:$SA" --role="roles/iam.serviceAccountUser"

# 5. Create a JSON key for that service account
gcloud iam service-accounts keys create sa-key.json \
  --iam-account="$SA"
```

> If you use **Artifact Registry** instead of the older GCR, also enable
> `artifactregistry.googleapis.com`, create a repo, grant
> `roles/artifactregistry.writer`, run `gcloud auth configure-docker <region>-docker.pkg.dev`,
> and use an image path like `<region>-docker.pkg.dev/<project>/<repo>/<service>`.

### B. Add the key to GitHub

- GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**
- Name it (e.g. `GCP_SA_KEY`) and paste the entire contents of `sa-key.json`.
- **Delete `sa-key.json` from your machine afterward.**

### C. Copy the files into the new repo

1. Copy `Dockerfile` into the service folder (adjust `CMD` and build steps to the stack).
2. Copy `.github/workflows/deploy.yml` and change the `env:` block:
   - `PROJECT_ID`, `REGION`, `SERVICE`, `IMAGE`
   - the `${{ secrets.XXX }}` name to match the secret you created
   - `working-directory:` to wherever the Dockerfile lives (omit if repo root)

### D. First deploy & runtime env vars

```bash
# Push to main -> pipeline runs and creates the service.
git push origin main

# Then set the app's runtime env vars (keep this file gitignored):
gcloud run services update <service> \
  --env-vars-file env.yaml --region <region>
```

The Cloud Run URL is printed at the end of the deploy step (and shown in the GCP console).
Put it in `APP_BASE_URL` / CORS settings as needed.

---

## Checklist / gotchas

- [ ] App listens on `process.env.PORT || 8080`.
- [ ] `env.yaml` (and `.env`) are in `.gitignore` — they hold live secrets.
- [ ] Service account has `run.admin` + `storage.admin` (or `artifactregistry.writer`) + `iam.serviceAccountUser`.
- [ ] Required GCP APIs are enabled (Run, Container Registry/Artifact Registry, Cloud Build).
- [ ] GitHub secret name in the workflow matches the one you created.
- [ ] `--allow-unauthenticated` is set if the API should be public.
- [ ] Runtime env vars are applied via `gcloud run services update --env-vars-file`,
      **not** baked into the image or the pipeline.

---

## Security note

The current setup stores a long-lived JSON service-account key as a GitHub secret. This
works, but Google's recommended approach is **Workload Identity Federation** (keyless),
which avoids a downloadable key entirely. Consider migrating later using
`google-github-actions/auth@v2` with WIF if security tightens up.
