// modules/user/tests/user.routes.spec.js
//
// Regression coverage for the bug where GET /api/v1/users was gated to
// admin/superadmin only. A project "lead" is a per-project role (team_lead)
// layered on top of the plain app-wide "user" role, so leads were 403'd out
// of the assignee picker. authMiddleware/validate/controller are stubbed so
// only the real authorise() middleware for each route runs.

function tag(fn, name) {
  fn.__tag = name;
  return fn;
}

jest.mock("../../../shared/middleware/auth.middleware", () => ({
  authMiddleware: tag((req, res, next) => next(), "auth"),
}));
jest.mock("../../../shared/middleware/validate.middleware", () => ({
  validate: () => tag((req, res, next) => next(), "validate"),
}));
jest.mock("../controllers/user.controller", () => ({
  UserController: {
    fetchAll: jest.fn((req, res) => res.status(200).json({ handler: "fetchAll" })),
    fetchById: jest.fn((req, res) => res.status(200).json({ handler: "fetchById" })),
    create: jest.fn((req, res) => res.status(200).json({ handler: "create" })),
    update: jest.fn((req, res) => res.status(200).json({ handler: "update" })),
    remove: jest.fn((req, res) => res.status(200).json({ handler: "remove" })),
  },
}));

const router = require("../routes/user.routes");

// authMiddleware/validate/controller are tagged above; the one untagged
// handler left in each route's stack is the real authorise(...) middleware.
function authoriseHandlerFor(path, method) {
  const layer = router.stack.find(
    (l) => l.route && l.route.path === path && l.route.methods[method]
  );
  if (!layer) throw new Error(`No route registered for ${method.toUpperCase()} ${path}`);
  const authoriseLayer = layer.route.stack.find((s) => !s.handle.__tag);
  if (!authoriseLayer) throw new Error(`No authorise() middleware found for ${method.toUpperCase()} ${path}`);
  return authoriseLayer.handle;
}

function invoke(handler, role) {
  const req = { user: role ? { role } : undefined };
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const res = { status };
  const next = jest.fn();
  handler(req, res, next);
  return { next, status, json };
}

describe("user.routes — role wiring", () => {
  it("lets a plain org member (e.g. a project lead) list users", () => {
    const handler = authoriseHandlerFor("/", "get");
    const { next, status } = invoke(handler, "user");
    expect(next).toHaveBeenCalled();
    expect(status).not.toHaveBeenCalled();
  });

  it("still lets admins and superadmins list users", () => {
    const handler = authoriseHandlerFor("/", "get");
    expect(invoke(handler, "admin").next).toHaveBeenCalled();
    expect(invoke(handler, "superadmin").next).toHaveBeenCalled();
  });

  it("still blocks an unrecognised or missing role from listing users", () => {
    const handler = authoriseHandlerFor("/", "get");
    const { next, status, json } = invoke(handler, "guest");
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: false, message: "Forbidden" }));

    expect(invoke(handler, undefined).next).not.toHaveBeenCalled();
  });

  it("keeps user create/update/delete/fetch-by-id admin-only", () => {
    const adminOnlyRoutes = [
      ["/:id", "get"],
      ["/", "post"],
      ["/:id", "patch"],
      ["/:id", "delete"],
    ];
    for (const [path, method] of adminOnlyRoutes) {
      const handler = authoriseHandlerFor(path, method);
      expect(invoke(handler, "user").next).not.toHaveBeenCalled();
      expect(invoke(handler, "admin").next).toHaveBeenCalled();
    }
  });
});
