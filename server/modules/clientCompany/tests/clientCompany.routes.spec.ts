// modules/clientCompany/tests/clientCompany.routes.spec.ts
//
// Supporter-roster routes are the one exception to product-team-only
// management: a company's own IT support lead may manage their own team too
// (the service further scopes it to that company's own lead).
//
// The two opposite-facing exceptions matter most and are what this spec pins:
//   - designating the PRIMARY lead is the product team's call, never a
//     supporter's  -> company.manage
//   - auto-assign routing is the company's own call, with no product-team
//     fallback                                        -> company.autoassign
// Bundling those two into one "configure" permission would hand each audience
// the other's power, so they are separate codes.
const {
  BUILTIN_ROLES,
  ROLE_KEYS,
} = require("../../access/catalog/permissions.catalog");

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

describe("client-company routes — supporter-roster management admits support leads too", () => {
  const routes: [string, string][] = [
    ["/:id/supporters", "post"],
    ["/:id/supporters/:userId", "delete"],
    ["/:id/supporters/:userId/lead", "patch"],
  ];

  it("admits the product team and a support lead, and blocks everyone else", () => {
    for (const [path, method] of routes) {
      const handler = guardFor(clientCompanyRouter, path, method);
      expect(invoke(handler, permissionsOf(ROLE_KEYS.ORG_ADMIN)).next).toHaveBeenCalled();
      expect(invoke(handler, permissionsOf(ROLE_KEYS.SUPPORT_LEAD)).next).toHaveBeenCalled();
      // A plain supporter cannot change their own company's roster.
      expect(invoke(handler, plainSupporterPermissions()).status).toHaveBeenCalledWith(403);
      // Nobody on the test side has any business here.
      expect(invoke(handler, permissionsOf(ROLE_KEYS.QA_ENGINEER)).status).toHaveBeenCalledWith(403);
      expect(invoke(handler, permissionsOf(ROLE_KEYS.TEST_LEAD)).status).toHaveBeenCalledWith(403);
    }
  });

  it("lets any supporter read the roster they belong to", () => {
    const handler = guardFor(clientCompanyRouter, "/:id/supporters", "get");
    expect(invoke(handler, permissionsOf(ROLE_KEYS.SUPPORT_LEAD)).next).toHaveBeenCalled();
    expect(invoke(handler, plainSupporterPermissions()).next).toHaveBeenCalled();
    expect(invoke(handler, permissionsOf(ROLE_KEYS.TESTER)).status).toHaveBeenCalledWith(403);
  });
});

describe("client-company routes — designating the primary lead is product-team-only", () => {
  it("admits the product team and blocks supporters, including leads", () => {
    const handler = guardFor(
      clientCompanyRouter,
      "/:id/supporters/:userId/primary",
      "patch"
    );
    expect(invoke(handler, permissionsOf(ROLE_KEYS.ORG_ADMIN)).next).toHaveBeenCalled();
    // The key assertion: peer leads cannot do this to each other or themselves.
    expect(invoke(handler, permissionsOf(ROLE_KEYS.SUPPORT_LEAD)).status).toHaveBeenCalledWith(403);
    expect(invoke(handler, plainSupporterPermissions()).status).toHaveBeenCalledWith(403);
    expect(invoke(handler, permissionsOf(ROLE_KEYS.QA_ENGINEER)).status).toHaveBeenCalledWith(403);
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

  it("is a different permission from designating the primary lead", () => {
    // Regression guard: these were one "company.configure" permission at first,
    // which gave the product team auto-assign and gave leads the primary flag.
    const supportLead = permissionsOf(ROLE_KEYS.SUPPORT_LEAD);
    const orgAdmin = permissionsOf(ROLE_KEYS.ORG_ADMIN);
    expect(supportLead.has("company.autoassign")).toBe(true);
    expect(supportLead.has("company.manage")).toBe(false);
    expect(orgAdmin.has("company.manage")).toBe(true);
    expect(orgAdmin.has("company.autoassign")).toBe(false);
  });
});

describe("client-company routes — company management is product-team-only", () => {
  const routes: [string, string][] = [
    ["/", "post"],
    ["/:id", "patch"],
    ["/:id", "delete"],
  ];

  it("blocks supporters from creating, editing or deleting companies", () => {
    for (const [path, method] of routes) {
      const handler = guardFor(clientCompanyRouter, path, method);
      expect(invoke(handler, permissionsOf(ROLE_KEYS.ORG_ADMIN)).next).toHaveBeenCalled();
      expect(invoke(handler, permissionsOf(ROLE_KEYS.SUPPORT_LEAD)).status).toHaveBeenCalledWith(403);
      expect(invoke(handler, plainSupporterPermissions()).status).toHaveBeenCalledWith(403);
    }
  });
});
