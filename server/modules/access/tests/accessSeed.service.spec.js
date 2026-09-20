// modules/access/tests/accessSeed.service.spec.js
//
// The seed's contract, exercised against an in-memory stand-in for Postgres:
//
//   - re-running never duplicates anything
//   - re-running never silently reverts an admin's customisation of a built-in
//     role, which is the whole point of --reset-builtin-permissions being opt-in
//   - the locked super role IS always restored, because it is never editable
//   - every user ends up with the role their legacy users.role maps to, and a
//     legacy team lead becomes a Test lead rather than losing capabilities
const {
  seedCatalog,
  seedPlatformRole,
  seedOrganizationRoles,
  backfillUserRoles,
} = require("../services/accessSeed.service");
const {
  PERMISSIONS,
  BUILTIN_ROLES,
  ROLE_KEYS,
} = require("../catalog/permissions.catalog");

// A tiny fake of just the SQL this module issues. Deliberately pattern-matched
// rather than a real parser: if the seed's SQL changes shape, this fails loudly
// instead of quietly passing.
function makeDb({ users = [] } = {}) {
  const db = {
    categories: new Map(),
    permissions: new Map(),
    roles: [],
    rolePermissions: [],
    userRoles: [],
    users,
    nextId: 1,
  };

  const query = async (sql, params = []) => {
    const s = sql.replace(/\s+/g, " ").trim();

    if (s.startsWith('INSERT INTO "permission_categories"')) {
      db.categories.set(params[0], { key: params[0], label: params[1] });
      return [];
    }
    if (s.startsWith('INSERT INTO "permissions"')) {
      db.permissions.set(params[0], { code: params[0], category: params[1], label: params[2] });
      return [];
    }
    if (s.startsWith('DELETE FROM "permissions"')) {
      const keep = new Set(params[0]);
      for (const code of [...db.permissions.keys()]) {
        if (!keep.has(code)) db.permissions.delete(code);
      }
      return [];
    }
    if (s.startsWith('DELETE FROM "permission_categories"')) {
      const keep = new Set(params[0]);
      for (const key of [...db.categories.keys()]) {
        if (!keep.has(key) && key !== "system") db.categories.delete(key);
      }
      return [];
    }
    // Must precede the upsert lookup below: that one's prefix also matches this SQL.
    if (s.startsWith('SELECT "id" FROM "roles" WHERE "key" = $1 AND ("organization_id"')) {
      const [key, orgId] = params;
      const matches = db.roles
        .filter((r) => r.key === key && (r.organizationId === orgId || r.organizationId === null))
        .sort((a, b) => (a.organizationId === null ? 1 : 0) - (b.organizationId === null ? 1 : 0));
      return matches.slice(0, 1).map((r) => ({ id: r.id }));
    }
    if (s.startsWith('SELECT "id" FROM "roles" WHERE "key" =')) {
      const [key, orgId] = params;
      const match = db.roles.filter((r) =>
        orgId === undefined
          ? r.key === key && r.organizationId === null
          : r.key === key && r.organizationId === orgId
      );
      return match.map((r) => ({ id: r.id }));
    }
    if (s.startsWith('UPDATE "roles"')) {
      const [id, name, description, isLocked] = params;
      const role = db.roles.find((r) => r.id === id);
      Object.assign(role, { name, description, isBuiltin: true, isLocked });
      return [];
    }
    if (s.startsWith('INSERT INTO "roles"')) {
      const [organizationId, key, name, description, isLocked] = params;
      const role = {
        id: `role-${db.nextId++}`,
        organizationId,
        key,
        name,
        description,
        isBuiltin: true,
        isLocked,
      };
      db.roles.push(role);
      return [{ id: role.id }];
    }
    if (s.startsWith('DELETE FROM "role_permissions"')) {
      db.rolePermissions = db.rolePermissions.filter((rp) => rp.roleId !== params[0]);
      return [];
    }
    if (s.startsWith('INSERT INTO "role_permissions"')) {
      const [roleId, code] = params;
      if (!db.rolePermissions.some((rp) => rp.roleId === roleId && rp.code === code)) {
        db.rolePermissions.push({ roleId, code });
      }
      return [];
    }
    if (s.startsWith('SELECT DISTINCT "organization_id"')) {
      return [...new Set(db.users.map((u) => u.organization_id).filter(Boolean))].map((id) => ({
        id,
      }));
    }
    if (s.startsWith('SELECT u."id", u."role"')) {
      return db.users
        .filter((u) => !db.userRoles.some((ur) => ur.userId === u.id))
        .map((u) => ({ ...u, is_team_lead: !!u.is_team_lead }));
    }
    if (s.startsWith('INSERT INTO "user_roles"')) {
      const [userId, roleId] = params;
      if (!db.userRoles.some((ur) => ur.userId === userId && ur.roleId === roleId)) {
        db.userRoles.push({ userId, roleId });
      }
      return [];
    }
    throw new Error(`Unhandled SQL in the seed fake:\n${s}`);
  };

  const permsOf = (key, orgId = "org-1") => {
    const role = db.roles.find(
      (r) => r.key === key && (orgId === null ? r.organizationId === null : r.organizationId === orgId)
    );
    return db.rolePermissions.filter((rp) => rp.roleId === role.id).map((rp) => rp.code).sort();
  };

  return { db, query, permsOf };
}

describe("accessSeed — catalog", () => {
  it("writes every permission plus the wildcard row the FK needs", async () => {
    const { db, query } = makeDb();
    await seedCatalog(query);
    expect(db.permissions.size).toBe(PERMISSIONS.length + 1);
    expect(db.permissions.get("*").category).toBe("system");
  });

  it("is idempotent — a second run changes nothing", async () => {
    const { db, query } = makeDb();
    await seedCatalog(query);
    const first = db.permissions.size;
    await seedCatalog(query);
    expect(db.permissions.size).toBe(first);
  });

  it("removes a permission dropped from the catalog", async () => {
    const { db, query } = makeDb();
    await seedCatalog(query);
    db.permissions.set("legacy.code", { code: "legacy.code", category: "access" });
    await seedCatalog(query);
    expect(db.permissions.has("legacy.code")).toBe(false);
  });
});

describe("accessSeed — built-in roles", () => {
  it("creates one row per built-in role for an organisation", async () => {
    const { db, query } = makeDb();
    await seedCatalog(query);
    await seedOrganizationRoles(query, "org-1");
    const expected = BUILTIN_ROLES.filter((r) => !r.platformWide).length;
    expect(db.roles.filter((r) => r.organizationId === "org-1")).toHaveLength(expected);
  });

  it("does not duplicate them on a second run", async () => {
    const { db, query } = makeDb();
    await seedCatalog(query);
    await seedOrganizationRoles(query, "org-1");
    const before = db.roles.length;
    await seedOrganizationRoles(query, "org-1");
    expect(db.roles).toHaveLength(before);
  });

  it("keeps an admin's customisation of a built-in role across re-seeds", async () => {
    const { db, query, permsOf } = makeDb();
    await seedCatalog(query);
    await seedOrganizationRoles(query, "org-1");

    // An admin removes a permission from QA manager through the UI.
    const role = db.roles.find((r) => r.key === ROLE_KEYS.QA_MANAGER);
    db.rolePermissions = db.rolePermissions.filter(
      (rp) => !(rp.roleId === role.id && rp.code === "result.amend")
    );

    await seedOrganizationRoles(query, "org-1");
    expect(permsOf(ROLE_KEYS.QA_MANAGER)).not.toContain("result.amend");
  });

  it("restores the designed set only when asked explicitly", async () => {
    const { db, query, permsOf } = makeDb();
    await seedCatalog(query);
    await seedOrganizationRoles(query, "org-1");

    const role = db.roles.find((r) => r.key === ROLE_KEYS.QA_MANAGER);
    db.rolePermissions = db.rolePermissions.filter((rp) => rp.roleId !== role.id);

    await seedOrganizationRoles(query, "org-1", { resetBuiltinPermissions: true });
    expect(permsOf(ROLE_KEYS.QA_MANAGER)).toContain("result.amend");
  });

  it("always restores the locked super role, which is never admin-editable", async () => {
    const { db, query, permsOf } = makeDb();
    await seedCatalog(query);
    await seedPlatformRole(query);

    const role = db.roles.find((r) => r.key === ROLE_KEYS.SUPER_ADMIN);
    expect(role.organizationId).toBeNull();
    db.rolePermissions = db.rolePermissions.filter((rp) => rp.roleId !== role.id);

    // No reset flag — a locked role's set is authoritative regardless.
    await seedPlatformRole(query);
    expect(permsOf(ROLE_KEYS.SUPER_ADMIN, null)).toEqual(["*"]);
  });
});

describe("accessSeed — backfill", () => {
  const users = [
    { id: "u-super", role: "superadmin", organization_id: "org-1", is_support_lead: false },
    { id: "u-admin", role: "admin", organization_id: "org-1", is_support_lead: false },
    { id: "u-user", role: "user", organization_id: "org-1", is_support_lead: false },
    { id: "u-lead", role: "user", organization_id: "org-1", is_support_lead: false, is_team_lead: true },
    { id: "u-sup", role: "it_support", organization_id: "org-1", is_support_lead: false },
    { id: "u-suplead", role: "it_support", organization_id: "org-1", is_support_lead: true },
  ];

  async function seedAll() {
    const ctx = makeDb({ users });
    await seedCatalog(ctx.query);
    await seedPlatformRole(ctx.query);
    await seedOrganizationRoles(ctx.query, "org-1");
    await backfillUserRoles(ctx.query);
    return ctx;
  }

  it("grants each user the role their legacy role maps to", async () => {
    const { db } = await seedAll();
    const roleKeyFor = (userId) => {
      const ur = db.userRoles.find((x) => x.userId === userId);
      return db.roles.find((r) => r.id === ur.roleId).key;
    };

    expect(roleKeyFor("u-super")).toBe(ROLE_KEYS.SUPER_ADMIN);
    expect(roleKeyFor("u-admin")).toBe(ROLE_KEYS.ORG_ADMIN);
    expect(roleKeyFor("u-user")).toBe(ROLE_KEYS.QA_ENGINEER);
    expect(roleKeyFor("u-sup")).toBe(ROLE_KEYS.SUPPORT_AGENT);
    expect(roleKeyFor("u-suplead")).toBe(ROLE_KEYS.SUPPORT_LEAD);
  });

  it("makes a legacy team lead a Test lead, not a QA engineer", async () => {
    // Under the old model this person could manage their project and triage its
    // bugs; QA engineer cannot, so mapping them there would remove access.
    const { db } = await seedAll();
    const ur = db.userRoles.find((x) => x.userId === "u-lead");
    expect(db.roles.find((r) => r.id === ur.roleId).key).toBe(ROLE_KEYS.TEST_LEAD);
  });

  it("resolves the super administrator to the platform-level role", async () => {
    const { db } = await seedAll();
    const ur = db.userRoles.find((x) => x.userId === "u-super");
    expect(db.roles.find((r) => r.id === ur.roleId).organizationId).toBeNull();
  });

  it("gives everyone exactly one role and never double-grants on a re-run", async () => {
    const ctx = await seedAll();
    expect(ctx.db.userRoles).toHaveLength(users.length);
    await backfillUserRoles(ctx.query);
    expect(ctx.db.userRoles).toHaveLength(users.length);
  });

  it("leaves a user who already holds a role alone", async () => {
    const ctx = await seedAll();
    // An admin moves someone to Tester; a later re-seed must not undo it.
    const tester = ctx.db.roles.find((r) => r.key === ROLE_KEYS.TESTER);
    ctx.db.userRoles = ctx.db.userRoles.filter((ur) => ur.userId !== "u-user");
    ctx.db.userRoles.push({ userId: "u-user", roleId: tester.id });

    await backfillUserRoles(ctx.query);
    const held = ctx.db.userRoles.filter((ur) => ur.userId === "u-user");
    expect(held).toHaveLength(1);
    expect(held[0].roleId).toBe(tester.id);
  });
});
