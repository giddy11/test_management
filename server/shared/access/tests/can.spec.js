// shared/access/tests/can.spec.js — the resolver itself.
//
// Union of roles, the wildcard, and deny-by-default in every direction an
// actor can arrive malformed.
const {
  can,
  canAny,
  canAll,
  hasWildcard,
  assertPermission,
  requirePermission,
  requireAny,
  requireAuthenticatedOnly,
  publicRoute,
  GUARD_TAG,
} = require("../can");

function invoke(handler, user) {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const next = jest.fn();
  handler(user === undefined ? {} : { user }, { status }, next);
  return { next, status, json };
}

describe("can — effective permissions", () => {
  it("is true for a permission the actor holds", () => {
    expect(can({ permissions: new Set(["result.enter"]) }, "result.enter")).toBe(true);
  });

  it("is false for a permission the actor does not hold", () => {
    expect(can({ permissions: new Set(["result.read"]) }, "result.enter")).toBe(false);
  });

  it("resolves the union of every role the actor holds", () => {
    // permissionsMiddleware flattens the roles into one set; this is what a
    // user with, say, Tester + Support agent ends up with.
    const union = new Set(["result.enter", "bug.create", "supportqueue.read"]);
    expect(can({ permissions: union }, "result.enter")).toBe(true);
    expect(can({ permissions: union }, "supportqueue.read")).toBe(true);
    expect(can({ permissions: union }, "role.manage")).toBe(false);
  });

  it("treats the wildcard as implying everything, including unknown codes", () => {
    const superAdmin = { permissions: new Set(["*"]) };
    expect(can(superAdmin, "role.manage")).toBe(true);
    expect(can(superAdmin, "a.permission.added.next.year")).toBe(true);
    expect(hasWildcard(superAdmin)).toBe(true);
  });

  it("does not treat an ordinary permission set as a wildcard holder", () => {
    expect(hasWildcard({ permissions: new Set(["role.manage"]) })).toBe(false);
  });

  it("accepts an array as well as a Set", () => {
    expect(can({ permissions: ["run.close"] }, "run.close")).toBe(true);
  });

  // Deny by default, from every direction an actor can be malformed.
  it.each([
    ["no actor", undefined],
    ["null actor", null],
    ["actor with no permissions field", { id: "u1" }],
    ["actor with null permissions", { id: "u1", permissions: null }],
    ["actor with an empty set", { id: "u1", permissions: new Set() }],
    ["actor with a non-iterable permissions value", { id: "u1", permissions: 42 }],
  ])("denies when there is %s", (_label, actor) => {
    expect(can(actor, "result.enter")).toBe(false);
    expect(hasWildcard(actor)).toBe(false);
  });

  it("canAny needs one, canAll needs them all", () => {
    const actor = { permissions: new Set(["bug.triage"]) };
    expect(canAny(actor, ["bug.triage", "bug.verify"])).toBe(true);
    expect(canAny(actor, ["bug.close", "bug.verify"])).toBe(false);
    expect(canAll(actor, ["bug.triage", "bug.verify"])).toBe(false);
    expect(canAll(actor, ["bug.triage"])).toBe(true);
  });

  it("assertPermission throws a 403 rather than returning false", () => {
    const actor = { permissions: new Set() };
    expect(() => assertPermission(actor, "run.close")).toThrow(
      expect.objectContaining({ statusCode: 403 })
    );
    expect(() =>
      assertPermission({ permissions: new Set(["run.close"]) }, "run.close")
    ).not.toThrow();
  });
});

describe("route guards", () => {
  it("requirePermission admits a holder and 403s everyone else", () => {
    const guard = requirePermission("role.manage");
    expect(invoke(guard, { id: "u", permissions: new Set(["role.manage"]) }).next).toHaveBeenCalled();
    expect(invoke(guard, { id: "u", permissions: new Set() }).status).toHaveBeenCalledWith(403);
  });

  it("requirePermission 401s an unauthenticated caller, not 403", () => {
    // The distinction matters to the client: 401 means "sign in", 403 means
    // "signed in, still not allowed".
    const { next, status } = invoke(requirePermission("role.manage"), undefined);
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
  });

  it("requireAny admits on any one of its codes", () => {
    const guard = requireAny("bug.triage", "bug.verify");
    expect(invoke(guard, { id: "u", permissions: new Set(["bug.verify"]) }).next).toHaveBeenCalled();
    expect(invoke(guard, { id: "u", permissions: new Set(["bug.close"]) }).status).toHaveBeenCalledWith(403);
  });

  it("requireAuthenticatedOnly admits any signed-in caller and rejects none", () => {
    const guard = requireAuthenticatedOnly("Own notifications");
    expect(invoke(guard, { id: "u", permissions: new Set() }).next).toHaveBeenCalled();
    expect(invoke(guard, undefined).status).toHaveBeenCalledWith(401);
  });

  it("publicRoute passes straight through", () => {
    expect(invoke(publicRoute("Sign-in"), undefined).next).toHaveBeenCalled();
  });

  it("tags every guard so the boot-time audit can tell declared from undeclared", () => {
    expect(requirePermission("role.read")[GUARD_TAG]).toEqual({
      kind: "permission",
      codes: ["role.read"],
    });
    expect(requireAny("a.b", "c.d")[GUARD_TAG].codes).toEqual(["a.b", "c.d"]);
    expect(publicRoute("why")[GUARD_TAG].kind).toBe("public");
    expect(requireAuthenticatedOnly("why")[GUARD_TAG].kind).toBe("self");
    // An ordinary handler carries no tag — that is what makes it "undeclared".
    expect(((req, res, next) => next())[GUARD_TAG]).toBeUndefined();
  });
});
