// modules/emailLog/tests/emailLog.routes.spec.ts
//
// Only a platform admin may read the email log; everyone else gets 403. The
// routes are checked two ways here: the REAL guard on each route of this router,
// run as every built-in role, and the controller's response envelope. (The role
// matrix spec separately walks the whole mounted app, so a route that lost its
// guard would fail there too.)
//
// authMiddleware / validate are stubbed and tagged, so the one untagged handler
// left in each route's stack is the real requirePermission(...).
const {
  BUILTIN_ROLES,
  ROLE_KEYS,
  PLATFORM_ONLY,
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
jest.mock("../services/emailLog.service", () => ({
  EmailLogService: { Instance: { list: jest.fn(), summary: jest.fn(), record: jest.fn() } },
}));

const router = require("../routes/emailLog.routes");
const { EmailLogController } = require("../controllers/emailLog.controller");
const { EmailLogService } = require("../services/emailLog.service");

const ROUTES: Array<[string, string]> = [
  ["/", "get"],
  ["/summary", "get"],
];

function guardFor(path: string, method: string) {
  const layer = router.stack.find((l: any) => l.route && l.route.path === path && l.route.methods[method]);
  if (!layer) throw new Error(`No route registered for ${method.toUpperCase()} ${path}`);
  // The real requirePermission(...) guard, found by the tag the access layer puts on it.
  const guard = layer.route.stack.find((s: any) => s.handle[GUARD_TAG]);
  if (!guard) throw new Error(`No permission guard found for ${method.toUpperCase()} ${path}`);
  return guard.handle;
}

function invoke(handler: any, user: any) {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const next = jest.fn();
  handler(user === undefined ? {} : { user }, { status }, next);
  return { next, status, json };
}

const permissionsOf = (key: string) => new Set<string>(BUILTIN_ROLES.find((r: any) => r.key === key).permissions);

describe("email log routes — who may read", () => {
  it("registers exactly the two read routes and nothing that writes", () => {
    const registered = router.stack.filter((l: any) => l.route).flatMap((l: any) => Object.keys(l.route.methods).map((m) => `${m} ${l.route.path}`));
    expect(registered.sort()).toEqual(["get /", "get /summary"]);
  });

  describe.each(ROUTES)("%s (%s)", (path, method) => {
    it("lets the super administrator through", () => {
      const { next, status } = invoke(guardFor(path, method), { id: "u1", permissions: permissionsOf(ROLE_KEYS.SUPER_ADMIN) });
      expect(next).toHaveBeenCalled();
      expect(status).not.toHaveBeenCalled();
    });

    it("lets through anyone holding emaillog.read", () => {
      const { next } = invoke(guardFor(path, method), { id: "u1", permissions: new Set(["emaillog.read"]) });
      expect(next).toHaveBeenCalled();
    });

    it("answers 401 with no user at all", () => {
      const { next, status } = invoke(guardFor(path, method), undefined);
      expect(next).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(401);
    });

    it("answers 403 with no permissions", () => {
      const { next, status } = invoke(guardFor(path, method), { id: "u1", permissions: new Set() });
      expect(next).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(403);
    });

    it("answers 403 with permissions not yet resolved — it never fails open", () => {
      const { next, status } = invoke(guardFor(path, method), { id: "u1" });
      expect(next).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(403);
    });

    const everyOtherRole: Array<[string, string]> = BUILTIN_ROLES.filter((r: any) => !r.isLocked).map((r: any): [string, string] => [
      r.name,
      r.key,
    ]);
    it.each(everyOtherRole)("answers 403 for the %s role", (_name, key) => {
      const { next, status } = invoke(guardFor(path, method), { id: "u1", permissions: permissionsOf(key) });
      expect(next).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(403);
    });

    it("answers 403 for someone holding every permission EXCEPT the platform-only ones", () => {
      const everythingElse = new Set<string>(ALL_CODES.filter((code: string) => !PLATFORM_ONLY.includes(code)));
      const { next, status } = invoke(guardFor(path, method), { id: "u1", permissions: everythingElse });
      expect(next).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(403);
    });
  });

  it("is a platform-only permission, so no organisation role holds it by default", () => {
    expect(PLATFORM_ONLY).toContain("emaillog.read");
    const orgAdmin = BUILTIN_ROLES.find((r: any) => r.key === ROLE_KEYS.ORG_ADMIN);
    expect(orgAdmin.permissions).not.toContain("emaillog.read");
    const holders = BUILTIN_ROLES.filter((r: any) => r.permissions.includes("emaillog.read") || r.permissions.includes("*"));
    expect(holders.map((r: any) => r.key)).toEqual([ROLE_KEYS.SUPER_ADMIN]);
  });
});

describe("EmailLogController", () => {
  const res = () => {
    const json = jest.fn();
    return { status: jest.fn(() => ({ json })), json };
  };
  const bodyOf = (response: { json: jest.Mock }) => response.json.mock.calls[0][0];

  it("answers the list in the project's paginated envelope, with the provider on every row", async () => {
    EmailLogService.Instance.list.mockResolvedValue({
      data: [
        {
          id: "a",
          createdAt: new Date("2026-11-23T10:00:00Z"),
          organizationId: "11111111-2222-3333-4444-555555555555",
          organizationName: null,
          toEmail: "person@company.com",
          subject: "Hello",
          kind: "bug_new",
          status: "sent",
          provider: "script_relay",
          fallback: true,
          providerMessageId: "relay-1",
          note: "gmail failed (x); sent through script_relay",
        },
      ],
      meta: { page: 1, limit: 25, total: 1, totalPages: 1, hasNext: false, hasPrev: false },
    });
    const response = res();
    const next = jest.fn();

    await EmailLogController.list(
      { validated: { query: { page: 1, limit: 25, status: "sent", provider: "script_relay" } } },
      response,
      next
    );

    expect(next).not.toHaveBeenCalled();
    expect(EmailLogService.Instance.list).toHaveBeenCalledWith({ status: "sent", provider: "script_relay" }, 1, 25);
    const body = bodyOf(response);
    expect(body).toMatchObject({ success: true, statusCode: 200, meta: { total: 1, totalPages: 1 } });
    expect(body.data[0]).toEqual({
      id: "a",
      createdAt: "2026-11-23T10:00:00.000Z",
      to: "person@company.com",
      subject: "Hello",
      kind: "bug_new",
      status: "sent",
      provider: "script_relay",
      fallback: true,
      providerMessageId: "relay-1",
      note: "gmail failed (x); sent through script_relay",
      organizationId: "11111111-2222-3333-4444-555555555555",
      // no owner company name on record, so a readable stand-in
      organizationName: "Organization 11111111",
    });
  });

  it("answers the summary as { sent, failed, skipped }", async () => {
    EmailLogService.Instance.summary.mockResolvedValue({ sent: 5, failed: 1, skipped: 0 });
    const response = res();

    await EmailLogController.summary({ validated: { query: { provider: "none" } } }, response, jest.fn());

    expect(EmailLogService.Instance.summary).toHaveBeenCalledWith({ provider: "none" });
    expect(bodyOf(response).data).toEqual({ sent: 5, failed: 1, skipped: 0 });
  });

  it("hands a service error to the error middleware instead of throwing", async () => {
    EmailLogService.Instance.list.mockRejectedValue(new Error("db down"));
    const next = jest.fn();

    await EmailLogController.list({ validated: { query: { page: 1, limit: 25 } } }, res(), next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: "db down" }));
  });
});
