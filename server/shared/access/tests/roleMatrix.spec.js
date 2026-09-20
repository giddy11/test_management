// shared/access/tests/roleMatrix.spec.js
//
// The matrix: for every seeded role and every permission in the catalog,
// assert the real API allows or denies exactly what the role definition says.
//
// This runs against the actual mounted router tree — the same guard functions
// Express will call in production — not against can() in isolation. A role
// definition and the routes can therefore never drift apart silently.
require("reflect-metadata");

const { createApp } = require("../../../app");
const { describeRoutes } = require("../routeAudit");
const { GUARD_TAG, can } = require("../can");
const {
  BUILTIN_ROLES,
  PERMISSIONS,
  WILDCARD,
  PLATFORM_ONLY,
  SUPPORT_DESK_ONLY,
} = require("../../../modules/access/catalog/permissions.catalog");

let routes;
const guards = new Map();

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

beforeAll(() => {
  const app = createApp();
  routes = describeRoutes(app._router, "");

  const walk = (stack, base) => {
    for (const layer of stack ?? []) {
      if (layer.route) {
        const path = `${base}${layer.route.path === "/" ? "" : layer.route.path}` || "/";
        const guard = layer.route.stack.find((s) => s.handle && s.handle[GUARD_TAG]);
        for (const method of Object.keys(layer.route.methods)) {
          if (layer.route.methods[method] && guard) {
            guards.set(`${method.toUpperCase()} ${path}`, guard.handle);
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
});

// Calls the route's real guard as the given actor. Returns "allow" | "deny".
function attempt(route, permissions) {
  const handler = guards.get(`${route.method} ${route.path}`);
  if (!handler) throw new Error(`No guard for ${route.method} ${route.path}`);
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const next = jest.fn();
  handler({ user: { id: "actor-1", permissions } }, { status }, next);
  if (next.mock.calls.length) return "allow";
  return `deny:${status.mock.calls[0]?.[0]}`;
}

const permissionRoutes = () => routes.filter((r) => r.kind === "permission");

describe("role matrix — the API matches every role definition", () => {
  for (const role of BUILTIN_ROLES) {
    const held = new Set(role.permissions);
    const holds = (code) => held.has(WILDCARD) || held.has(code);

    describe(role.name, () => {
      it("is allowed through exactly the routes its permissions cover", () => {
        const wrong = [];
        for (const route of permissionRoutes()) {
          // requireAny(...) passes if the actor holds ANY of the codes.
          const expected = route.codes.some(holds) ? "allow" : "deny:403";
          const actual = attempt(route, held);
          if (actual !== expected) {
            wrong.push(
              `${route.method} ${route.path} [${route.codes.join("|")}] expected ${expected}, got ${actual}`
            );
          }
        }
        expect(wrong).toEqual([]);
      });

      it("is denied every catalog permission it does not hold", () => {
        const wrong = [];
        for (const p of PERMISSIONS) {
          const expected = holds(p.code);
          const actual = can({ permissions: held }, p.code);
          if (actual !== expected) wrong.push(`${p.code}: expected ${expected}, got ${actual}`);
        }
        expect(wrong).toEqual([]);
      });
    });
  }

  it("lets the locked super-administrator role through every permission route", () => {
    const superRole = BUILTIN_ROLES.find((r) => r.isLocked);
    expect(superRole.permissions).toEqual([WILDCARD]);
    const denied = permissionRoutes()
      .filter((r) => attempt(r, new Set([WILDCARD])) !== "allow")
      .map((r) => `${r.method} ${r.path}`);
    expect(denied).toEqual([]);
  });

  it("denies an actor holding no permissions every permission route", () => {
    const allowed = permissionRoutes()
      .filter((r) => attempt(r, new Set()) === "allow")
      .map((r) => `${r.method} ${r.path}`);
    expect(allowed).toEqual([]);
  });

  it("covers every catalog permission with at least one route, or names the exception", () => {
    // A permission nothing enforces is dead weight in the role editor: it
    // promises a capability the API never consults.
    const enforced = new Set(permissionRoutes().flatMap((r) => r.codes));

    // These are enforced below the route, inside a service, because the action
    // shares a route with a less-privileged one (a status transition on an
    // update endpoint) or is a scoping switch rather than a route guard.
    const enforcedInServices = new Set([
      "project.readall",
      "project.configure",
      "testcase.approve",
      "testcase.deprecate",
      "run.close",
      "result.amend",
      "bug.triage",
      "bug.verify",
      "bug.close",
      "featurerequest.decide",
      "ticket.assign",
      "ticket.resolve",
      "ticket.close",
      "analytics.read",
      "analytics.team",
    ]);

    const orphaned = PERMISSIONS.map((p) => p.code).filter(
      (code) => !enforced.has(code) && !enforcedInServices.has(code)
    );
    expect(orphaned).toEqual([]);
  });
});

describe("separation of duties — the splits the model promises", () => {
  const role = (key) => new Set(BUILTIN_ROLES.find((r) => r.key === key).permissions);

  it("lets engineers enter results but never amend a closed run", () => {
    for (const key of ["tester", "qa_engineer", "test_lead"]) {
      expect(role(key).has("result.enter")).toBe(true);
      expect(role(key).has("result.amend")).toBe(false);
    }
    // Amending is the organisation administrator's alone.
    expect(role("org_admin").has("result.amend")).toBe(true);
  });

  it("keeps whoever reports a bug from verifying its fix", () => {
    for (const key of ["tester", "qa_engineer"]) {
      expect(role(key).has("bug.create")).toBe(true);
      expect(role(key).has("bug.verify")).toBe(false);
    }
    for (const key of ["test_lead", "org_admin"]) {
      expect(role(key).has("bug.verify")).toBe(true);
    }
  });

  it("stops a tester approving their own test cases", () => {
    expect(role("qa_engineer").has("testcase.create")).toBe(true);
    expect(role("qa_engineer").has("testcase.approve")).toBe(false);
    expect(role("test_lead").has("testcase.approve")).toBe(true);
  });

  it("confines configuration to administrators", () => {
    const config = [
      "sla.configure",
      "form.configure",
      "widget.configure",
      "integration.manage",
      "role.manage",
    ];
    for (const key of ["tester", "qa_engineer", "test_lead", "viewer"]) {
      for (const code of config) {
        expect({ key, code, held: role(key).has(code) }).toEqual({ key, code, held: false });
      }
    }
  });

  it("keeps the vendor's controls out of every customer role", () => {
    // The regression that started this: Organisation administrator was defined
    // as "every permission", which put the platform owner's cross-org
    // reporting, product announcements, site banner and support inbox into a
    // customer admin's sidebar. Only the locked super role reaches them.
    const holders = (code) =>
      BUILTIN_ROLES.filter((r) => r.permissions.includes(code)).map((r) => r.key);
    for (const code of PLATFORM_ONLY) {
      expect({ code, holders: holders(code) }).toEqual({ code, holders: [] });
    }
    // ...and they are still real permissions the wildcard reaches.
    for (const code of PLATFORM_ONLY) {
      expect(can({ permissions: new Set([WILDCARD]) }, code)).toBe(true);
    }
  });

  it("keeps the client company's queue out of every product-org role", () => {
    const internal = ["org_admin", "test_lead", "qa_engineer", "tester", "viewer"];
    for (const key of internal) {
      const held = new Set(BUILTIN_ROLES.find((r) => r.key === key).permissions);
      for (const code of SUPPORT_DESK_ONLY) {
        expect({ key, code, held: held.has(code) }).toEqual({ key, code, held: false });
      }
    }
  });

  it("still gives the organisation administrator everything inside its own workspace", () => {
    const held = new Set(BUILTIN_ROLES.find((r) => r.key === "org_admin").permissions);
    for (const code of [
      "role.manage", "role.assign", "user.create", "user.delete",
      "project.create", "project.delete", "project.readall",
      "testcase.approve", "run.close", "result.amend",
      "bug.close", "featurerequest.decide",
      "ticket.delete", "form.configure", "widget.configure",
      "company.manage", "supporter.manage",
      "sla.configure", "analytics.team", "audit.read",
    ]) {
      expect({ code, held: held.has(code) }).toEqual({ code, held: true });
    }
  });

  it("holds role.manage only where the model says it should be", () => {
    // role.manage can grant any permission, so it is effectively
    // administrator-level and must not leak into an operational role.
    const holders = BUILTIN_ROLES.filter(
      (r) => r.permissions.includes("role.manage") || r.permissions.includes(WILDCARD)
    ).map((r) => r.key);
    expect(holders.sort()).toEqual(["org_admin", "super_admin"]);
  });
});
