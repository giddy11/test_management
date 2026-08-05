// modules/clientCompany/tests/clientCompany.routes.spec.ts
// Supporter-roster routes are the one exception to admin-only management: a
// company's own IT support lead can manage their own team too (the service
// layer further scopes it to that company's own lead).

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

function authoriseHandlerFor(router: any, path: string, method: string) {
  const layer = router.stack.find(
    (l: any) => l.route && l.route.path === path && l.route.methods[method]
  );
  if (!layer) throw new Error(`No route for ${method.toUpperCase()} ${path}`);
  const authoriseLayer = layer.route.stack.find((s: any) => !s.handle.__tag);
  if (!authoriseLayer) throw new Error(`No authorise() for ${method.toUpperCase()} ${path}`);
  return authoriseLayer.handle;
}

function invoke(handler: any, role?: string) {
  const req = { user: role ? { role } : undefined };
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const res = { status };
  const next = jest.fn();
  handler(req, res, next);
  return { next, status, json };
}

describe("client-company routes — supporter-roster management admits it_support too", () => {
  const routes: [string, string][] = [
    ["/:id/supporters", "get"],
    ["/:id/supporters", "post"],
    ["/:id/supporters/:userId", "delete"],
    ["/:id/supporters/:userId/lead", "patch"],
  ];

  it("admits superadmin/admin/it_support and blocks a plain user", () => {
    for (const [path, method] of routes) {
      const handler = authoriseHandlerFor(clientCompanyRouter, path, method);
      expect(invoke(handler, "superadmin").next).toHaveBeenCalled();
      expect(invoke(handler, "admin").next).toHaveBeenCalled();
      expect(invoke(handler, "it_support").next).toHaveBeenCalled();
      expect(invoke(handler, "user").next).not.toHaveBeenCalled();
    }
  });
});

describe("client-company routes — designating the primary lead is admin-only", () => {
  it("admits superadmin/admin and blocks a plain user or it_support", () => {
    const handler = authoriseHandlerFor(clientCompanyRouter, "/:id/supporters/:userId/primary", "patch");
    expect(invoke(handler, "superadmin").next).toHaveBeenCalled();
    expect(invoke(handler, "admin").next).toHaveBeenCalled();
    expect(invoke(handler, "user").next).not.toHaveBeenCalled();
    expect(invoke(handler, "it_support").next).not.toHaveBeenCalled();
  });
});

describe("client-company routes — /me is it_support-only", () => {
  it("admits it_support and blocks everyone else", () => {
    const handler = authoriseHandlerFor(clientCompanyRouter, "/me", "get");
    expect(invoke(handler, "it_support").next).toHaveBeenCalled();
    expect(invoke(handler, "superadmin").next).not.toHaveBeenCalled();
    expect(invoke(handler, "admin").next).not.toHaveBeenCalled();
    expect(invoke(handler, "user").next).not.toHaveBeenCalled();
  });
});

describe("client-company routes — auto-assign is it_support-only, no admin fallback", () => {
  it("admits it_support and blocks admins and plain users", () => {
    const handler = authoriseHandlerFor(clientCompanyRouter, "/:id/auto-assign", "patch");
    expect(invoke(handler, "it_support").next).toHaveBeenCalled();
    expect(invoke(handler, "superadmin").next).not.toHaveBeenCalled();
    expect(invoke(handler, "admin").next).not.toHaveBeenCalled();
    expect(invoke(handler, "user").next).not.toHaveBeenCalled();
  });
});
