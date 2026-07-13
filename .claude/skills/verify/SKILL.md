---
name: verify
description: Verify client (React/Vite) changes by driving the app in a real browser via Cypress against the stubbed dev server.
---

# Verifying TestMate client changes

## Launch (safe, stubbed — never touches the shared dev/prod Aiven DB)

```bash
cd client
npm run dev:e2e     # vite --mode e2e on http://localhost:5173, API points at dead port 4545
```

Run it in the background; probe readiness with `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/`.

## Drive with Cypress

Write a scratch spec at `client/cypress/e2e/<name>-scratch.cy.ts`, then:

```bash
cd client
env -u ELECTRON_RUN_AS_NODE npx cypress run --spec "cypress/e2e/<name>-scratch.cy.ts"
```

- **Must unset `ELECTRON_RUN_AS_NODE`** or Cypress's Electron fails to start.
- Every API call must be stubbed (`cy.intercept`); unstubbed requests fail fast on the dead port — that's intentional.
- Useful custom commands (cypress/support/commands.ts): `cy.login(role)` (stubs /auth/me + seeds tokens; roles: user/admin/superadmin fixtures), `cy.stubLayout()`, `cy.stubDashboard()`, `cy.dataCy(id)`.
- Take evidence screenshots with `cy.screenshot("name", { capture: "viewport" })`; they land in `client/cypress/screenshots/<spec>/`.

## Cleanup

Delete the scratch spec and its screenshots folder, and stop the dev server task.
TaskStop leaves the Vite child process alive on Windows — also free the port:

```powershell
Get-NetTCPConnection -LocalPort 5173 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

(If a previous session's server still holds 5173, it serves current files — just reuse it.)

## Gotchas

- IntersectionObserver-based UI behaves differently inside the Cypress AUT iframe (rootMargin is relative to the top-level viewport) — prefer scroll-position assertions, or expect discrepancies.
- `npx tsc -b` fails if `npm install` hasn't been run (e.g. `country-state-city` missing) — install first, and don't count typecheck as verification.
