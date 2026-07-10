# TestMate E2E Testing (Cypress)

End-to-end tests for the TestMate client, written in TypeScript with Cypress.

## The one rule that shapes everything

**TestMate's dev and prod environments share one database.** E2E tests must
never create, edit, or delete real data. The suite is therefore **fully
network-stubbed by default**: every API call is intercepted with
`cy.intercept()` and answered with fixtures shaped like the backend's
`ApiResponse` envelope. No backend or database is needed to run the tests, and
runs are fast, deterministic, and repeatable.

To make this fail-safe, the app under test is started with `npm run dev:e2e`
(`vite --mode e2e`), which loads [.env.e2e](../.env.e2e) and points
`VITE_API_URL` at a dead local port. If a test forgets to stub a call, the
request fails immediately — it can never reach the shared database.

## Installation

Everything installs with the client dependencies:

```bash
cd client
npm install
```

## Running the tests

| Command | What it does |
|---|---|
| `npm run e2e` | Starts the app in e2e mode, runs the whole suite headlessly, shuts down. **Use this one.** |
| `npm run e2e:open` | Same, but opens the interactive Cypress runner (headed mode). |
| `npm run cy:run` | Headless run against an app you already started with `npm run dev:e2e`. |
| `npm run cy:open` | Interactive runner against an already-running app. |
| `npm run dev:e2e` | Just the app, in e2e mode (port 5173, strict). |

Run a single spec:

```bash
npx cypress run --spec "cypress/e2e/auth/login.cy.ts"
```

## Folder conventions

```
cypress/
  e2e/                 Specs, grouped by feature area
    auth/              Login, logout, session, forgot/reset password, verify email
    dashboard/         Dashboard rendering + sidebar navigation
    projects/          Projects CRUD + project detail (suites, runs tab)
    testmgmt/          Suite cases, case detail, run execution, XLSX import/export
    users/             Team management + role-based access control
    featureRequests/   List, voting, submission + detail (status transitions)
    bugs/              List, filters, reporting + detail (manage/status)
    notifications/     Notification bell, mark read, deep links
    settings/          Profile + change password
    onboarding/        driver.js onboarding tour
    admin/             Activity log, Organisations, Announcements + publishing
    public/            Unauthenticated feedback portal
    live/              Opt-in read-only smoke tests against a real API
  fixtures/            Stub payloads (users/, dashboard/, projects/, testmgmt/, ...)
  support/
    api.ts             ApiResponse envelope builders + URL matchers
    commands.ts        Custom commands (typed via declare global)
    e2e.ts             Global setup, loaded before every spec
cypress.config.ts      Cypress configuration (client root)
```

**Naming:** specs are `kebab-case.cy.ts`; fixtures are `kebab-case.json`
grouped in folders per domain; one `describe` per user journey.

## Custom commands

| Command | Purpose |
|---|---|
| `cy.dataCy("login-submit")` | Select by `data-cy` attribute — the only sanctioned selector style. |
| `cy.login(role?, overrides?)` | Stubbed login: seeds fake tokens, stubs `/auth/me` (`@me`) and all layout calls. Roles: `"user"` (default), `"admin"`, `"superadmin"`. Overrides patch the fixture user (e.g. `{ onboardingCompleted: false }`). |
| `cy.stubLayout()` | Stubs notifications, site banner, what's-new — called for you by `cy.login()`. |
| `cy.stubDashboard()` | Stubs `@overview`, `@recentRuns`, `@projects`. |
| `cy.interceptApi(method, path, { body, statusCode? }, alias)` | Precise intercept for one `/api/v1` path (query-string tolerant, never swallows sub-paths). |
| `cy.logout()` | Logs out through the sidebar user menu. |
| `cy.waitForLoader()` | Waits for the shared `PageLoader` to disappear. |
| `cy.loginByApi(email, password)` | Real API login wrapped in `cy.session()` — **live mode only**. |

Envelope helpers live in `support/api.ts`: `ok(data, meta?)`, `fail(message,
statusCode)`, `listMeta(total)`.

## Writing a new test

1. Stub what the page fetches **before** `cy.visit()`:

```ts
import { ok, listMeta } from "../../support/api"

describe("Projects", () => {
  beforeEach(() => {
    cy.login("admin")
    cy.interceptApi("GET", "/projects", { body: ok([project], listMeta(1)) }, "projects")
    cy.visit("/projects")
    cy.wait("@projects")
  })
})
```

2. Wait on aliases (`cy.wait("@projects")`) — never `cy.wait(5000)`.
3. Select with `cy.dataCy(...)`. If an element has no `data-cy`, add one in the
   component (attribute only — no behavior change).
4. Keep tests independent: Cypress test isolation clears storage between tests,
   and `cy.login()` re-seeds everything a test needs.

## Environment variables

| Variable | Used by | Purpose |
|---|---|---|
| `VITE_API_URL` (in `.env.e2e`) | the app | Dead port — guarantees stubbed mode can't hit a real API. Don't change it. |
| `CYPRESS_apiUrl` | Cypress | Real API base URL for live mode. |
| `CYPRESS_TEST_USER_EMAIL` / `CYPRESS_TEST_USER_PASSWORD` | live specs | Credentials for the read-only live smoke test. Unset ⇒ live specs are skipped. Never commit these. |
| `CI` | cypress.config.ts | Enables video recording on CI. |

Live mode example (PowerShell):

```powershell
$env:CYPRESS_TEST_USER_EMAIL = "qa@example.com"
$env:CYPRESS_TEST_USER_PASSWORD = "..."
$env:CYPRESS_apiUrl = "https://<a-safe-api-host>"
npm run e2e
```

⚠️ Live specs must stay **read-only** (log in, look, leave). Do not add live
tests that write data — see the shared-database rule at the top.

## CI

[.github/workflows/e2e.yml](../../.github/workflows/e2e.yml) runs on every PR
and push to `main` touching `client/**`: installs, type-checks + builds, starts
the app in e2e mode, runs the suite in Chrome, and uploads screenshots (on
failure) and videos as artifacts.

## Troubleshooting

- **A request "escaped" and the page shows a network error** — the test forgot
  a stub. Check the Cypress command log for the red XHR; add an
  `cy.interceptApi(...)` for it before `cy.visit()`.
- **`strictPort` error on 5173** — another dev server is already running; stop
  it or run `npm run cy:run` against it instead.
- **Element not found for `cy.dataCy(...)`** — the attribute may not exist in
  the component yet; add `data-cy` where needed.
- **Socket.IO console noise** — the presence socket retries against the dead
  e2e port; harmless and ignored by the tests.
- **Cypress binary missing** (fresh machine): `npx cypress install`.
- **`bad option: --smoke-test` when starting Cypress** — the terminal has
  `ELECTRON_RUN_AS_NODE=1` set (happens in terminals spawned by Electron apps
  such as VS Code extensions). The Cypress binary is Electron-based, and that
  variable makes it run as plain Node. Unset it first:
  `$env:ELECTRON_RUN_AS_NODE = $null` (PowerShell) or run from a regular
  terminal.
