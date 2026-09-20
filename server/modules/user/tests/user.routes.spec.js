// modules/user/tests/user.routes.spec.js
//
// Regression coverage for the bug where GET /api/v1/users was gated to
// admin/superadmin only. A project "lead" is a per-project role (team_lead)
// layered on top of the plain app-wide role, so leads were 403'd out of the
// assignee picker.
//
// The route is now gated on the `user.read` permission rather than a role-name
// allowlist, so the regression is expressed as: every role that needs to pick
// an assignee holds user.read, and the write routes need their own permissions.
// authMiddleware/validate/controller are stubbed so only the real
// requirePermission(...) middleware for each route runs.
const {
  BUILTIN_ROLES,
  ROLE_KEYS,
} = require("../../access/catalog/permissions.catalog");

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
    setRoles: jest.fn((req, res) => res.status(200).json({ handler: "setRoles" })),
  },
}));

const router = require("../routes/user.routes");

// authMiddleware/validate/controller are tagged above; the one untagged
// handler left in each route's stack is the real requirePermission(...).
function guardFor(path, method) {
  const layer = router.stack.find(
    (l) => l.route && l.route.path === path && l.route.methods[method]
  );
  if (!layer) throw new Error(`No route registered for ${method.toUpperCase()} ${path}`);
  const guardLayer = layer.route.stack.find((s) => !s.handle.__tag);
  if (!guardLayer) {
    throw new Error(`No permission guard found for ${method.toUpperCase()} ${path}`);
  }
  return guardLayer.handle;
}

function permissionsOf(roleKey) {
  const role = BUILTIN_ROLES.find((r) => r.key === roleKey);
  if (!role) throw new Error(`Unknown role ${roleKey}`);
  return new Set(role.permissions);
}

function invoke(handler, permissions) {
  const req = permissions ? { user: { id: "u1", permissions } } : {};
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const next = jest.fn();
  handler(req, { status }, next);
  return { next, status, json };
}

describe("user.routes — permission wiring", () => {
  it("lets a plain org member (e.g. a project lead) list users", () => {
    const handler = guardFor("/", "get");
    // The regression: QA engineer is what a legacy 'user' migrates to.
    const { next, status } = invoke(handler, permissionsOf(ROLE_KEYS.QA_ENGINEER));
    expect(next).toHaveBeenCalled();
    expect(status).not.toHaveBeenCalled();
  });

  it("lets every role that picks assignees list users", () => {
    const handler = guardFor("/", "get");
    for (const key of [
      ROLE_KEYS.ORG_ADMIN,
      ROLE_KEYS.QA_MANAGER,
      ROLE_KEYS.TEST_LEAD,
      ROLE_KEYS.QA_ENGINEER,
      ROLE_KEYS.TESTER,
    ]) {
      expect(invoke(handler, permissionsOf(key)).next).toHaveBeenCalled();
    }
  });

  it("lets a super administrator through on the strength of the wildcard", () => {
    const handler = guardFor("/", "get");
    const { next } = invoke(handler, new Set(["*"]));
    expect(next).toHaveBeenCalled();
  });

  it("blocks an unauthenticated caller with 401", () => {
    const handler = guardFor("/", "get");
    const { next, status } = invoke(handler, null);
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
  });

  it("blocks a caller whose roles do not include user.read", () => {
    const handler = guardFor("/", "get");
    // An external supporter has no business reading the product org's roster.
    const { next, status } = invoke(handler, permissionsOf(ROLE_KEYS.SUPPORT_AGENT));
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
  });

  it("keeps the write routes behind their own permissions", () => {
    const engineer = permissionsOf(ROLE_KEYS.QA_ENGINEER);
    for (const [path, method] of [["/", "post"], ["/:id", "patch"], ["/:id", "delete"]]) {
      const { next, status } = invoke(guardFor(path, method), engineer);
      expect(next).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(403);
    }
  });

  it("lets an organisation administrator through the write routes", () => {
    const admin = permissionsOf(ROLE_KEYS.ORG_ADMIN);
    for (const [path, method] of [["/", "post"], ["/:id", "patch"], ["/:id", "delete"]]) {
      expect(invoke(guardFor(path, method), admin).next).toHaveBeenCalled();
    }
  });

  it("gates role assignment on role.assign, not on user.update", () => {
    const handler = guardFor("/:id/roles", "put");
    // QA manager can edit nothing about access, by design.
    const manager = permissionsOf(ROLE_KEYS.QA_MANAGER);
    expect(invoke(handler, manager).status).toHaveBeenCalledWith(403);
    expect(invoke(handler, permissionsOf(ROLE_KEYS.ORG_ADMIN)).next).toHaveBeenCalled();
  });
});
