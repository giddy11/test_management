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

// Routes whose guard is a platform permission, plus routes declared project-level:
// those are gated on project.read at the route (the per-project decision is the
// service's, and is covered by the service specs).
const permissionRoutes = () =>
  routes.filter((r) => r.kind === "permission" || r.kind === "project");

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
    // project.readall and project.manageall are read inside ProjectService (they
    // are what turns a project role into "everything in the organisation"), and
    // the two analytics permissions decide what the dashboard computes.
    const enforcedInServices = new Set([
      "project.readall",
      "analytics.read",
      "analytics.team",
    ]);

    const orphaned = PERMISSIONS.map((p) => p.code).filter(
      (code) => !enforced.has(code) && !enforcedInServices.has(code)
    );
    expect(orphaned).toEqual([]);
  });
});

describe("what the platform level promises", () => {
  const role = (key) => new Set(BUILTIN_ROLES.find((r) => r.key === key).permissions);

  it("keeps everything about working INSIDE a project out of the catalog", () => {
    // The review moved these to the project level, where roles already exist
    // (project_members.role: member / team_lead). A permission that reappears here
    // would quietly reintroduce a second, platform-wide way to decide the same
    // thing, which is what caused the confusion in the first place.
    const projectLevel =
      /^(suite|testcase|import|note|run|result|bug|featurerequest|ticket|livechat|widget|form|supporter)\./;
    // Client companies belong to a project too: creating, editing, deleting and
    // rostering one is the project's team lead's call. company.autoassign stays,
    // because it is the company's own routing rule, not the product team's.
    const stray = PERMISSIONS.map((p) => p.code).filter(
      (code) =>
        projectLevel.test(code) ||
        /^project\.(create|update|delete|configure)$/.test(code) ||
        /^company\.(read|manage)$/.test(code)
    );
    expect(stray).toEqual([]);
  });

  it("leaves exactly the project permissions the review said should stay", () => {
    const project = PERMISSIONS.filter((p) => p.category === "projects").map((p) => p.code).sort();
    // view, view all, export -- and manage all, which cannot be project-level:
    // creating a project has no project to hold a role in.
    expect(project).toEqual(["project.export", "project.manageall", "project.read", "project.readall"]);
  });

  it("gates every project-level route on project.read alone, at the route", () => {
    const projectRoutes = routes.filter((r) => r.kind === "project");
    // 85 routes: the whole project-level surface. A sudden drop would mean routes
    // silently moved to another kind of guard.
    expect(projectRoutes.length).toBeGreaterThan(70);
    for (const r of projectRoutes) {
      expect({ route: `${r.method} ${r.path}`, codes: r.codes }).toEqual({
        route: `${r.method} ${r.path}`,
        codes: ["project.read"],
      });
    }
  });

  it("keeps an external supporter out of the whole project-level surface", () => {
    // Support lead holds no project.read, so none of these routes admit them --
    // which is what stops the product surface leaking to the customer side now
    // that the routes no longer name a role.
    const support = role("support_lead");
    for (const r of routes.filter((x) => x.kind === "project")) {
      expect({ route: `${r.method} ${r.path}`, admitted: attempt(r, support) === "allow" }).toEqual({
        route: `${r.method} ${r.path}`,
        admitted: false,
      });
    }
  });

  it("lets only the organisation administrator manage every project", () => {
    // project.manageall is full control of every project in the organisation,
    // including deleting it. Nobody else holds it by default.
    const holders = BUILTIN_ROLES.filter((r) => r.permissions.includes("project.manageall")).map(
      (r) => r.key
    );
    expect(holders).toEqual(["org_admin"]);
  });

  it("keeps org-wide read and manage-everything together: only the administrator holds either", () => {
    // project.readall lets someone SEE every project; project.manageall lets them
    // act as team lead on every project. A role holding only the first is
    // read-only in projects it is not a member of. No built-in role is that any
    // more (the Viewer role was retired), but a custom role can be, and
    // ProjectService resolves it to the read-only "viewer" tier.
    const holders = (code) =>
      BUILTIN_ROLES.filter((r) => r.permissions.includes(code)).map((r) => r.key);
    expect(holders("project.readall")).toEqual(["org_admin"]);
    expect(holders("project.manageall")).toEqual(["org_admin"]);
  });

  it("confines configuration to administrators", () => {
    const config = ["sla.configure", "role.manage", "role.assign", "project.manageall"];
    for (const key of ["tester", "qa_engineer", "test_lead"]) {
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
    const internal = ["org_admin", "test_lead", "qa_engineer", "tester"];
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
      "role.read", "role.manage", "role.assign",
      "user.read", "user.create", "user.update", "user.delete",
      "project.read", "project.readall", "project.manageall", "project.export",
      "dashboard.read", "analytics.read", "analytics.team",
      "sla.read", "sla.configure", "audit.read",
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
