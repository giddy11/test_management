// modules/feedback/tests/feedbackSupport.routes.spec.ts
// The support portal must be reachable only by the external client-company
// roles, and the product team's triage must be unreachable by them. That
// boundary used to be a role-name allowlist; it is now the fact that
// supportqueue.* and ticket.* are held by disjoint sets of roles.
// authMiddleware/validate/controllers are stubbed so only the real
// requirePermission(...) middleware runs.
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
jest.mock("../controllers/feedbackSupport.controller", () => ({
  FeedbackSupportController: {
    fetchQueue: jest.fn((req: any, res: any) => res.status(200).json({})),
    teammates: jest.fn((req: any, res: any) => res.status(200).json({})),
    updateStatus: jest.fn((req: any, res: any) => res.status(200).json({})),
    assign: jest.fn((req: any, res: any) => res.status(200).json({})),
    history: jest.fn((req: any, res: any) => res.status(200).json({})),
    resolve: jest.fn((req: any, res: any) => res.status(200).json({})),
    escalate: jest.fn((req: any, res: any) => res.status(200).json({})),
    notifySubmitter: jest.fn((req: any, res: any) => res.status(200).json({})),
  },
}));
jest.mock("../controllers/feedback.controller", () => ({
  FeedbackController: {
    fetchAll: jest.fn((req: any, res: any) => res.status(200).json({})),
    manage: jest.fn((req: any, res: any) => res.status(200).json({})),
    history: jest.fn((req: any, res: any) => res.status(200).json({})),
    remove: jest.fn((req: any, res: any) => res.status(200).json({})),
    setLink: jest.fn((req: any, res: any) => res.status(200).json({})),
  },
}));

const supportRouter = require("../routes/feedbackSupport.routes");
const feedbackRouter = require("../routes/feedback.routes");

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

// The external personas: a lead, and a supporter who is not a lead (no built-in
// role — an admin gives them one, see plainSupporterPermissions).
const EXTERNAL = [permissionsOf(ROLE_KEYS.SUPPORT_LEAD), plainSupporterPermissions()];
// Every product-org role, ORG_ADMIN included. The support queue belongs to an
// external client company, so no customer role reaches it — not even the
// organisation administrator, which owns everything inside its own workspace
// and nothing outside it.
const INTERNAL = [
  ROLE_KEYS.ORG_ADMIN,
  ROLE_KEYS.TEST_LEAD,
  ROLE_KEYS.QA_ENGINEER,
  ROLE_KEYS.TESTER,
];

describe("feedbackSupport.routes — permission wiring", () => {
  // Routes every supporter works, lead or not.
  const shared: [string, string][] = [
    ["/", "get"],
    ["/:id", "patch"],
    ["/:id/history", "get"],
    ["/:id/resolve", "post"],
    ["/:id/escalate", "post"],
    ["/:id/notify-submitter", "post"],
  ];
  // Routing work to a teammate stays a lead-only capability.
  const leadOnly: [string, string][] = [
    ["/teammates", "get"],
    ["/:id/assign", "patch"],
  ];

  it("admits both external support roles on every shared portal route", () => {
    for (const [path, method] of shared) {
      const handler = guardFor(supportRouter, path, method);
      for (const permissions of EXTERNAL) {
        expect(invoke(handler, permissions).next).toHaveBeenCalled();
      }
    }
  });

  it("admits only a support lead on the routing routes", () => {
    for (const [path, method] of leadOnly) {
      const handler = guardFor(supportRouter, path, method);
      expect(invoke(handler, permissionsOf(ROLE_KEYS.SUPPORT_LEAD)).next).toHaveBeenCalled();
      const agent = invoke(handler, plainSupporterPermissions());
      expect(agent.next).not.toHaveBeenCalled();
      expect(agent.status).toHaveBeenCalledWith(403);
    }
  });

  it("blocks every internal role from the portal", () => {
    for (const [path, method] of [...shared, ...leadOnly]) {
      const handler = guardFor(supportRouter, path, method);
      for (const key of INTERNAL) {
        const { next, status } = invoke(handler, permissionsOf(key));
        expect(next).not.toHaveBeenCalled();
        expect(status).toHaveBeenCalledWith(403);
      }
    }
  });

  it("stops even the platform owner by scoping rather than by permission", () => {
    // The locked super role holds the wildcard, so the gate cannot be what
    // excludes it — having no client company is, via
    // FeedbackSupportService.requireCompany. Everyone else is stopped earlier,
    // at the permission gate, which is the stricter of the two.
    const handler = guardFor(supportRouter, "/", "get");
    expect(invoke(handler, new Set(["*"])).next).toHaveBeenCalled();
    expect(permissionsOf(ROLE_KEYS.ORG_ADMIN).has("supportqueue.read")).toBe(false);
  });

  it("blocks an unauthenticated caller from the portal", () => {
    for (const [path, method] of shared) {
      const { next, status } = invoke(guardFor(supportRouter, path, method), null);
      expect(next).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(401);
    }
  });
});

describe("feedback.routes — external supporters locked out of triage", () => {
  const routes: [string, string][] = [
    ["/", "get"],
    ["/:id", "patch"],
    ["/:id/history", "get"],
    ["/:id", "delete"],
  ];

  it("blocks the external support roles and admits the internal ones", () => {
    for (const [path, method] of routes) {
      const handler = guardFor(feedbackRouter, path, method);
      for (const permissions of EXTERNAL) {
        const { next, status } = invoke(handler, permissions);
        expect(next).not.toHaveBeenCalled();
        expect(status).toHaveBeenCalledWith(403);
      }
      // Reading triage is broad; deleting a ticket is not — check each route
      // against a role the catalog says should reach it.
      expect(invoke(handler, permissionsOf(ROLE_KEYS.ORG_ADMIN)).next).toHaveBeenCalled();
    }
  });

  // Who may delete a ticket, or rotate a project's public form link, is no longer a
  // platform permission: it is the caller's role IN that project (the team lead),
  // enforced by FeedbackService (deleteFeedback / setFeedbackLink -- see
  // feedback.service.spec.ts and feedbackLink.service.spec.js). The route's only
  // job is to keep people who cannot use projects at all out, which is exactly
  // what stops an external supporter above.
  it("leaves deleting a ticket and rotating the form link to the project's own roles", () => {
    for (const [path, method] of [
      ["/:id", "delete"],
      ["/projects/:id/link", "post"],
    ] as [string, string][]) {
      const handler = guardFor(feedbackRouter, path, method);
      // Anyone who can use projects reaches the service, which then decides.
      expect(invoke(handler, permissionsOf(ROLE_KEYS.QA_ENGINEER)).next).toHaveBeenCalled();
      expect(invoke(handler, permissionsOf(ROLE_KEYS.TESTER)).next).toHaveBeenCalled();
      // ...but never someone on the customer side.
      expect(invoke(handler, permissionsOf(ROLE_KEYS.SUPPORT_LEAD)).status).toHaveBeenCalledWith(403);
    }
  });
});

// This spec uses require() rather than imports; the empty export keeps its
// top-level declarations file-scoped instead of colliding with other specs.
export {};
