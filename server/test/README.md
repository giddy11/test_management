# Server tests

Jest, run from `server/`. No database, no HTTP server, no `supertest` — every test is a plain
unit test that imports a class or router directly and injects fakes.

## Running tests

```bash
npm test                                    # everything (jest --runInBand)
npm test:watch                              # watch mode

npx jest user.routes                        # one file — substring match on path
npx jest modules/user/tests/user.routes.spec.js   # one file — full path
npx jest user.routes -t "lets a plain org member" # one test inside a file, by name
npx jest modules/testCase                   # everything under a module
```

`--runInBand` (already in `npm test`) runs suites serially — there's no shared DB state to
race on, so it's mainly to keep output readable; add it yourself if you invoke `jest` directly
and want the same ordering.

## Where tests live

Co-located with the module, not in this folder:

```
modules/<module>/tests/<name>.service.spec.js   # service unit tests (the norm)
modules/<module>/tests/<name>.routes.spec.js    # route/middleware wiring tests (rare — see below)
```

Jest's `testMatch` (in `package.json`) only picks up `**/modules/**/tests/**/*.spec.@(js|ts)`.
A spec anywhere else (including this `test/` folder) will **not** run — this folder is
infrastructure (see below), not a test suite itself.

## `dataSource.mock.js`

`jest.moduleNameMapper` in `package.json` redirects every import of
`infrastructure/database/dataSource` to [`dataSource.mock.js`](./dataSource.mock.js) during
tests. It replaces the real TypeORM `AppDataSource` with a stub whose `getRepository()` returns
a `Proxy` that throws on any property access:

> DB access during tests is blocked. Inject a mock repository into the service under test.

This is intentional and load-bearing, not a workaround:
- Repositories build their singletons from `AppDataSource.getRepository(...)` at **import time**,
  so without this stub every test file would try to open a real Postgres connection just by
  requiring a service.
- If a test forgets to inject a mock repo, it fails loudly instead of silently hitting a real
  (possibly shared dev/prod) database.
- Fire-and-forget side effects that call the real repo under the hood — e.g. activity logging,
  run-completion notifications — will log `console.error("[activity] log failed: DB access
  during tests is blocked...")` during a passing test run. That's expected noise from code that
  intentionally swallows its own errors (`.catch(...)`), not a failure; it only becomes a problem
  if a test asserts on that side effect and needs it mocked instead.

## Pattern 1 — service unit tests (the default)

Construct the service with hand-rolled `jest.fn()` repositories/collaborators instead of hitting
`AppDataSource`. See `modules/user/tests/user.service.spec.js` for the fullest example, or
`modules/testCase/tests/testCaseAttachment.service.spec.js` for one that also fakes an external
service (Cloudinary storage) the same way:

```js
const { UserService } = require("../services/user.service");

function makeRepo() {
  return {
    fetchPaginated: jest.fn(),
    findById: jest.fn(),
    // ...one jest.fn() per method the service calls
  };
}

describe("UserService", () => {
  let repo, service;
  beforeEach(() => {
    repo = makeRepo();
    service = new UserService(repo);
  });

  it("scopes an admin to their organisation", async () => {
    repo.findById.mockResolvedValue(admin);
    repo.fetchPaginated.mockResolvedValue({ data: [], meta: {} });
    await service.fetchUsers("admin-1", { page: 1, limit: 20 });
    expect(repo.fetchPaginated).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1" })
    );
  });
});
```

Assert on **what the repo was called with** and on thrown `AppError`s (`.rejects.toMatchObject({
statusCode: ... })`), not on database state — there is none.

## Pattern 2 — route/middleware wiring tests (rare)

Use this only when the bug is in the route file itself — e.g. the wrong roles passed to
`authorise(...)` on a specific route — where a service-level test can't see the problem because
it never touches the router. `modules/user/tests/user.routes.spec.js` is the reference example
(added after a bug where `GET /api/v1/users` was wrongly admin-only, blocking project leads from
the assignee picker).

The approach, with no `supertest`/HTTP server involved:
1. `jest.mock` everything on the route *except* `authorise` — `authMiddleware`, `validate`, and
   the controller — tagging each stub function (`fn.__tag = "auth"`) so it's identifiable later.
2. `require()` the real router. Express's `Router` exposes its registered layers on
   `router.stack`; each route's own middleware chain is `layer.route.stack`.
3. Find the one **untagged** handler in a route's stack — that's the real `authorise(...)`
   closure — and invoke it directly with a fake `{ req: { user: { role } }, res, next }` to
   assert who gets through and who gets a 403.

```js
function authoriseHandlerFor(path, method) {
  const layer = router.stack.find((l) => l.route && l.route.path === path && l.route.methods[method]);
  return layer.route.stack.find((s) => !s.handle.__tag).handle;
}
```

This exercises the production `authorise` middleware and the exact roles wired into that route,
so it fails on the old code and passes on the fix — verified by temporarily reverting the fix
and re-running the spec.
