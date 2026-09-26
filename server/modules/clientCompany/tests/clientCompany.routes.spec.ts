// modules/clientCompany/tests/clientCompany.routes.spec.ts
//
// A client company belongs to a project, so managing one is decided by the
// caller's role IN that project. company.read, company.manage and
// supporter.manage no longer exist; what this spec pins is the boundary the
// routes keep around that decision:
//
//   - company management is declared project-level: the route checks project.read
//     (which no supporter holds, so none can reach it) and ClientCompanyService
//     asserts team lead / project.manageall -- see clientCompany.service.spec.ts
//   - the supporter roster serves a SECOND audience, a company's own IT support
//     lead, who holds no project.read. Those routes are declared authenticated-only
//     and the service decides for both audiences
//   - auto-assign routing is the company's own call, with no product-team
//     fallback                                        -> company.autoassign
// Designating the PRIMARY lead is the product team's call, never a supporter's,
// so it stays behind the project-level guard rather than the roster one.
const {
  BUILTIN_ROLES,
  ROLE_KEYS,
  ALL_CODES,
} = require("../../access/catalog/permissions.catalog");
const { GUARD_TAG } = require("../../../shared/access/can");

function tag(fn: any, name: string) {
  fn.__tag = name;
  return fn;
}

jest.mock("../../../shared/middleware/auth.middleware", () => ({
  authMiddleware: tag((req: any, res: any, next: any) => next(), "auth"),
}));
jest.mock("../../../shared/middleware/validate.middleware", () => ({
  validate: () => tag((req: any, res: any, next: any) => next(), "validate"),
}));
jest.mock("../controllers/clientCompany.controller", () => ({
  ClientCompanyController: {
    fetchMine: jest.fn((req: any, res: any) => res.status(200).json({})),
    fetchAll: jest.fn((req: any, res: any) => res.status(200).json({})),
    create: jest.fn((req: any, res: any) => res.status(200).json({})),
    update: jest.fn((req: any, res: any) => res.status(200).json({})),
    remove: jest.fn((req: any, res: any) => res.status(200).json({})),
    setLink: jest.fn((req: any, res: any) => res.status(200).json({})),
    setAutoAssign: jest.fn((req: any, res: any) => res.status(200).json({})),
    listSupporters: jest.fn((req: any, res: any) => res.status(200).json({})),
    createSupporter: jest.fn((req: any, res: any) => res.status(200).json({})),
    removeSupporter: jest.fn((req: any, res: any) => res.status(200).json({})),
    setSupporterLead: jest.fn((req: any, res: any) => res.status(200).json({})),
    setPrimarySupportLead: jest.fn((req: any, res: any) => res.status(200).json({})),
  },
}));

const clientCompanyRouter = require("../routes/clientCompany.routes");

function guardFor(router: any, path: string, method: string) {
  const layer = router.stack.find(
    (l: any) => l.route && l.route.path === path && l.route.methods[method]
  );
  if (!layer) throw new Error(`No route for ${method.toUpperCase()} ${path}`);
  const guardLayer = layer.route.stack.find((s: any) => !s.handle.__tag);
  if (!guardLayer) throw new Error(`No permission guard for ${method.toUpperCase()} ${path}`);
  return guardLayer.handle;
}

const { plainSupporterPermissions } = require("../../../test/actors");

function permissionsOf(roleKey: string): Set<string> {
  const role = BUILTIN_ROLES.find((r: any) => r.key === roleKey);
  if (!role) throw new Error(`Unknown role ${roleKey}`);
  return new Set<string>(role.permissions as string[]);
}

function invoke(handler: any, permissions: Set<string> | null) {
  const req = permissions ? { user: { id: "u1", permissions } } : {};
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const next = jest.fn();
  handler(req, { status }, next);
  return { next, status, json };
}

describe("client-company routes — the retired platform permissions are gone", () => {
  it("no longer offers company.read, company.manage or supporter.manage", () => {
    // Regression guard: a platform-wide way to manage a company would sit beside
    // the project's own team lead and quietly disagree with it.
    for (const code of ["company.read", "company.manage", "supporter.manage"]) {
      expect(ALL_CODES).not.toContain(code);
    }
    for (const role of BUILTIN_ROLES) {
      for (const code of ["company.read", "company.manage", "supporter.manage"]) {
        expect({ role: role.key, code, held: role.permissions.includes(code) }).toEqual({
          role: role.key,
          code,
          held: false,
        });
      }
    }
  });
});

describe("client-company routes — company management is project-level", () => {
  const routes: [string, string][] = [
    ["/", "get"],
    ["/", "post"],
    ["/:id", "patch"],
    ["/:id", "delete"],
    ["/:id/link", "post"],
    ["/:id/supporters/:userId/primary", "patch"],
  ];

  it("is declared project-level, so the service decides by role in the project", () => {
    for (const [path, method] of routes) {
      const handler = guardFor(clientCompanyRouter, path, method);
      expect({ path, method, kind: handler[GUARD_TAG].kind }).toEqual({
        path,
        method,
        kind: "project",
      });
    }
  });

  it("admits anyone who can use projects and refuses every supporter, lead or not", () => {
    for (const [path, method] of routes) {
      const handler = guardFor(clientCompanyRouter, path, method);
      // Who may actually change a company (team lead / project.manageall) is the
      // service's call; the route only lets the project-facing roles through.
      expect(invoke(handler, permissionsOf(ROLE_KEYS.ORG_ADMIN)).next).toHaveBeenCalled();
      expect(invoke(handler, permissionsOf(ROLE_KEYS.TEST_LEAD)).next).toHaveBeenCalled();
      expect(invoke(handler, permissionsOf(ROLE_KEYS.QA_ENGINEER)).next).toHaveBeenCalled();
      // The key assertion: peer leads cannot designate the primary lead, nor
      // touch the company record, because they hold no project.read.
      expect(invoke(handler, permissionsOf(ROLE_KEYS.SUPPORT_LEAD)).status).toHaveBeenCalledWith(403);
      expect(invoke(handler, plainSupporterPermissions()).status).toHaveBeenCalledWith(403);
      expect(invoke(handler, null).status).toHaveBeenCalledWith(401);
    }
  });
});

describe("client-company routes — supporter-roster routes admit support leads too", () => {
  const routes: [string, string][] = [
    ["/:id/supporters", "get"],
    ["/:id/supporters", "post"],
    ["/:id/supporters/:userId", "delete"],
    ["/:id/supporters/:userId/lead", "patch"],
  ];

  it("is authenticated-only at the route: the service decides for both audiences", () => {
    for (const [path, method] of routes) {
      const handler = guardFor(clientCompanyRouter, path, method);
      expect({ path, method, kind: handler[GUARD_TAG].kind }).toEqual({
        path,
        method,
        kind: "self",
      });
      // The company's own lead has no project.read, so a project-level guard here
      // would lock them out of their own roster.
      expect(invoke(handler, permissionsOf(ROLE_KEYS.SUPPORT_LEAD)).next).toHaveBeenCalled();
      expect(invoke(handler, permissionsOf(ROLE_KEYS.ORG_ADMIN)).next).toHaveBeenCalled();
      expect(invoke(handler, null).status).toHaveBeenCalledWith(401);
    }
  });

  it("leaves refusing a non-lead or a foreign company to the service", () => {
    // Not asserted here on purpose: a plain supporter passes the route and is
    // refused by ClientCompanyService (clientCompany.service.spec.ts, "403s a
    // non-lead supporter of the same company"). This pins that the route does not
    // pretend otherwise.
    const handler = guardFor(clientCompanyRouter, "/:id/supporters", "post");
    expect(invoke(handler, plainSupporterPermissions()).next).toHaveBeenCalled();
  });
});

describe("client-company routes — a supporter's own company", () => {
  it("is self-service: authenticated-only, scoped to the actor's own clientCompanyId", () => {
    const handler = guardFor(clientCompanyRouter, "/me", "get");
    expect(handler[GUARD_TAG].kind).toBe("self");
    expect(invoke(handler, permissionsOf(ROLE_KEYS.SUPPORT_LEAD)).next).toHaveBeenCalled();
    expect(invoke(handler, null).status).toHaveBeenCalledWith(401);
  });
});

describe("client-company routes — auto-assign is the company's own call", () => {
  it("admits a support lead and blocks the product team's administrator", () => {
    const handler = guardFor(clientCompanyRouter, "/:id/auto-assign", "patch");
    expect(invoke(handler, permissionsOf(ROLE_KEYS.SUPPORT_LEAD)).next).toHaveBeenCalled();
    // "No admin fallback at all" — the product-team role does not hold it.
    expect(invoke(handler, permissionsOf(ROLE_KEYS.ORG_ADMIN)).status).toHaveBeenCalledWith(403);
    expect(invoke(handler, plainSupporterPermissions()).status).toHaveBeenCalledWith(403);
    expect(invoke(handler, permissionsOf(ROLE_KEYS.QA_ENGINEER)).status).toHaveBeenCalledWith(403);
  });

  it("is held by the support lead and by no product-team role", () => {
    expect(permissionsOf(ROLE_KEYS.SUPPORT_LEAD).has("company.autoassign")).toBe(true);
    expect(permissionsOf(ROLE_KEYS.ORG_ADMIN).has("company.autoassign")).toBe(false);
  });
});
