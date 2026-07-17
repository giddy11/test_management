# TestMate Postman collection

Scoped to testing `POST /api/v1/integrations/companies` — the endpoint that provisions a new
client company + its first IT support lead in one call. It is **not** a complete mirror of the
API yet (see `ai_agent_flow_backend.md` §21 for that standard) — just Auth + Projects (enough to
get a bearer token and a `projectId`) plus the Integrations — Companies folder.

## Import

1. Postman → Import → select both `TestMate.postman_collection.json` and
   `TestMate.postman_environment.json`.
2. Select the **TestMate — Local** environment in the top-right environment picker.
3. If your server runs on a different port/host, edit the environment's `baseUrl`.

## Getting a working login

The collection ships with placeholder credentials (`loginEmail` / `loginPassword` collection
variables — edit them under the collection's Variables tab). Point them at any real admin or
superadmin account, e.g. one seeded with:

```bash
SUPERADMIN_EMAIL=you@example.com SUPERADMIN_PASSWORD='ChangeMe123!' npm run seed:superadmin
```

## Running it

Requests are self-priming — run them top to bottom and each one feeds the next via collection
variables (`pm.collectionVariables.set(...)` in their **Tests** tab):

1. **Auth → Login** — captures `accessToken` / `refreshToken` / `userId`.
2. **Projects → List Projects** — captures `projectId` from the first project returned. Skip
   this and paste a specific project's id into the `projectId` collection variable instead if you
   want to target a particular project.
3. **Integrations — Companies → Create Company (Provision)** — the actual endpoint under test.
   It's intentionally **unauthenticated** (no bearer token, no API key — see the endpoint's own
   description in the collection and the docs page's "Company provisioning API" section) and
   takes `projectId` directly in the body. The sample body uses Postman's `{{$timestamp}}`
   dynamic variable in the emails so repeat runs don't collide on the unique-email constraints —
   swap in fixed values if you want to deliberately trigger one of the saved 409 examples.
   Captures `companyId` / `supportLeadId` on success.
4. **Integrations — Companies → Verify — List Client Companies for Project** — authenticated
   admin view, confirms the new company (and its supporter count) shows up under the project.

## Saved example responses

Every request has a `response[]` example for each status code it can actually return (success,
404/409/422 from the service's validation, 401/403 from route auth, 429 from the rate limiter) —
open a request and use the **Examples** dropdown (top-right of the request pane) to view them
without needing a live server.

## Extending this collection

Add a new folder per module as more endpoints get covered (mirror `modules/`), following the
same pattern: one request per endpoint, `noauth` override on public/unauthenticated routes, a
saved example per status code, and post-response scripts that capture anything later requests
need.
