// shared/access/tests/routeCoverage.spec.js
//
// Deny by default, asserted against the REAL mounted router tree rather than
// against the helper in isolation.
//
// This is the test that makes the invariant stick: a new route that forgets to
// declare a permission fails here at build time, as well as failing closed at
// runtime (routeAudit.js splices a denying handler into it).
require("reflect-metadata");

// The routers pull in controllers -> services -> repositories, which build
// themselves from AppDataSource at import time. jest.moduleNameMapper swaps in
// test/dataSource.mock.js, so nothing touches a real database here.
const { createApp } = require("../../../app");
const { describeRoutes } = require("../routeAudit");
const { GUARD_TAG } = require("../can");

let routes;

beforeAll(() => {
  const app = createApp();
  // Express 4 keeps the mounted stack on app._router.
  routes = describeRoutes(app._router, "");
});

describe("route coverage — every route declares what it needs", () => {
  it("registers a substantial number of routes (guards against an empty walk)", () => {
    expect(routes.length).toBeGreaterThan(150);
  });

  it("has no route without a declaration", () => {
    const undeclared = routes.filter((r) => r.kind === "undeclared");
    expect(
      undeclared.map((r) => `${r.method} ${r.path}`).sort()
    ).toEqual([]);
  });

  it("declares every route as exactly one of permission, self or public", () => {
    const kinds = new Set(routes.map((r) => r.kind));
    expect([...kinds].sort()).toEqual(["permission", "public", "self"]);
  });

  it("gates every permission-declaring route on a code that exists in the catalog", () => {
    const { PERMISSIONS } = require("../../../modules/access/catalog/permissions.catalog");
    const known = new Set(PERMISSIONS.map((p) => p.code));
    const unknown = routes
      .filter((r) => r.kind === "permission")
      .flatMap((r) => r.codes.filter((c) => !known.has(c)).map((c) => `${r.method} ${r.path} -> ${c}`));
    expect(unknown).toEqual([]);
  });

  it("keeps the public surface to the routes that are meant to be open", () => {
    // A route becoming public is the single highest-impact accident this
    // system can suffer, so the list is pinned rather than counted.
    const publicPaths = routes
      .filter((r) => r.kind === "public")
      .map((r) => r.path)
      .filter((p, i, a) => a.indexOf(p) === i)
      .sort();

    for (const p of publicPaths) {
      const allowed =
        p === "/health" ||
        p.startsWith("/api/v1/auth/") ||
        p.startsWith("/api/v1/public/") ||
        p.startsWith("/api/v1/integrations/");
      expect({ path: p, allowed }).toEqual({ path: p, allowed: true });
    }
  });

  it("requires authentication on every non-public route", () => {
    // publicRoute() is a no-op; everything else must reject a caller with no
    // req.user before it reaches a handler.
    const guarded = routes.filter((r) => r.kind !== "public");
    for (const route of guarded) {
      const handler = handlerFor(route);
      const status = jest.fn(() => ({ json: jest.fn() }));
      const next = jest.fn();
      handler({}, { status }, next);
      expect({ route: `${route.method} ${route.path}`, next: next.mock.calls.length }).toEqual({
        route: `${route.method} ${route.path}`,
        next: 0,
      });
      expect(status).toHaveBeenCalledWith(401);
    }
  });
});

// Re-walks the tree to recover the actual guard function for a described route.
let guardIndex = null;
function handlerFor(route) {
  if (!guardIndex) {
    guardIndex = new Map();
    const app = createApp();
    const walk = (stack, base) => {
      for (const layer of stack ?? []) {
        if (layer.route) {
          const path = `${base}${layer.route.path === "/" ? "" : layer.route.path}` || "/";
          const guard = layer.route.stack.find((s) => s.handle && s.handle[GUARD_TAG]);
          for (const method of Object.keys(layer.route.methods)) {
            if (layer.route.methods[method] && guard) {
              guardIndex.set(`${method.toUpperCase()} ${path}`, guard.handle);
            }
          }
          continue;
        }
        if (layer.handle && typeof layer.handle === "function" && layer.handle.stack) {
          walk(layer.handle.stack, `${base}${decode(layer)}`);
        }
      }
    };
    walk(app._router.stack, "");
  }
  const key = `${route.method} ${route.path}`;
  const handler = guardIndex.get(key);
  if (!handler) throw new Error(`No guard recovered for ${key}`);
  return handler;
}

function decode(layer) {
  if (!layer.regexp || layer.regexp.fast_slash) return "";
  const decoded = layer.regexp.source
    .replace("^\\/", "/")
    .replace("\\/?(?=\\/|$)", "")
    .replace("(?=\\/|$)", "")
    .replace(/\\\//g, "/")
    .replace(/\$$/, "");
  return decoded === "/" ? "" : decoded;
}

module.exports = { handlerFor };
