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
  retireBuiltinRoles,
  backfillUserRoles,
} = require("../services/accessSeed.service");
const {
  PERMISSIONS,
  BUILTIN_ROLES,
  ROLE_KEYS,
  RETIRED_ROLE_KEYS,
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
      // ON CONFLICT DO NOTHING must leave an existing row alone.
      if (s.includes("DO NOTHING") && db.permissions.has(params[0])) return [];
      db.permissions.set(params[0], { code: params[0], category: params[1], label: params[2] });
      return [];
    }
    if (s.startsWith('DELETE FROM "permissions"')) {
      const keep = new Set(params[0]);
      for (const code of [...db.permissions.keys()]) {
        if (!keep.has(code)) db.permissions.delete(code);
      }
      // The foreign key is ON DELETE CASCADE: a dropped permission leaves every
      // role that held it. Real Postgres does this; the migration relies on it.
      db.rolePermissions = db.rolePermissions.filter((rp) => db.permissions.has(rp.code));
      return [];
    }
    // Counting queries the migration uses to check its own grant landed.
    if (s.startsWith('SELECT COUNT(DISTINCT "role_id")::int AS n')) {
      const ids = new Set(
        db.rolePermissions
          .filter((rp) => ["project.configure", "project.create"].includes(rp.code))
          .map((rp) => rp.roleId)
      );
      return [{ n: ids.size }];
    }
    if (s.startsWith('SELECT COUNT(*)::int AS n FROM "role_permissions"')) {
      return [{ n: db.rolePermissions.filter((rp) => rp.code === "project.manageall").length }];
    }
    // Grant project.manageall to every role holding project.configure or
    // project.create. Must precede the plain role_permissions insert below: the
    // two share a prefix.
    if (s.startsWith('INSERT INTO "role_permissions"') && s.includes("SELECT DISTINCT")) {
      const holders = new Set(
        db.rolePermissions
          .filter((rp) => ["project.configure", "project.create"].includes(rp.code))
          .map((rp) => rp.roleId)
      );
      for (const roleId of holders) {
        if (!db.rolePermissions.some((rp) => rp.roleId === roleId && rp.code === "project.manageall")) {
          db.rolePermissions.push({ roleId, code: "project.manageall" });
        }
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
    // Must precede the generic UPDATE below, which reads its params positionally.
    if (s.startsWith('UPDATE "roles" SET "key" = NULL')) {
      const retired = new Set(params[0]);
      for (const role of db.roles) {
        if (role.organizationId !== null && retired.has(role.key)) {
          Object.assign(role, { key: null, isBuiltin: false });
        }
      }
      return [];
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

    // An admin removes a permission from Test lead through the UI.
    const role = db.roles.find((r) => r.key === ROLE_KEYS.TEST_LEAD);
    db.rolePermissions = db.rolePermissions.filter(
      (rp) => !(rp.roleId === role.id && rp.code === "testcase.approve")
    );

    await seedOrganizationRoles(query, "org-1");
    expect(permsOf(ROLE_KEYS.TEST_LEAD)).not.toContain("testcase.approve");
  });

  it("restores the designed set only when asked explicitly", async () => {
    const { db, query, permsOf } = makeDb();
    await seedCatalog(query);
    await seedOrganizationRoles(query, "org-1");

    const role = db.roles.find((r) => r.key === ROLE_KEYS.TEST_LEAD);
    db.rolePermissions = db.rolePermissions.filter((rp) => rp.roleId !== role.id);

    await seedOrganizationRoles(query, "org-1", { resetBuiltinPermissions: true });
    expect(permsOf(ROLE_KEYS.TEST_LEAD)).toContain("analytics.read");
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

describe("accessSeed — retired built-in roles", () => {
  // [key, name, a permission it held]
  const RETIRED = [
    ["qa_manager", "QA manager", "result.amend"],
    ["support_manager", "Support manager", "ticket.close"],
    ["support_agent", "Support agent", "supportqueue.update"],
    ["viewer", "Viewer", "project.readall"],
  ];

  // An organisation seeded before these roles were dropped: it has them, with
  // people in them and a permission set an admin has tuned.
  async function seededBeforeRetirement() {
    const ctx = makeDb();
    await seedCatalog(ctx.query);
    await seedPlatformRole(ctx.query);
    await seedOrganizationRoles(ctx.query, "org-1");

    const legacy = {};
    for (const [key, name, perm] of RETIRED) {
      const role = {
        id: `role-legacy-${key}`,
        organizationId: "org-1",
        key,
        name,
        description: null,
        isBuiltin: true,
        isLocked: false,
      };
      ctx.db.roles.push(role);
      ctx.db.rolePermissions.push({ roleId: role.id, code: perm });
      ctx.db.userRoles.push({ userId: `member-of-${key}`, roleId: role.id });
      legacy[key] = role;
    }
    return { ...ctx, legacy };
  }

  it("are exactly the roles this spec expects", () => {
    expect([...RETIRED_ROLE_KEYS].sort()).toEqual(RETIRED.map(([key]) => key).sort());
  });

  it("are no longer seeded", () => {
    for (const key of RETIRED_ROLE_KEYS) {
      expect(BUILTIN_ROLES.some((r) => r.key === key)).toBe(false);
      expect(Object.values(ROLE_KEYS)).not.toContain(key);
    }
  });

  it("are not created for a new organisation", async () => {
    const { db, query } = makeDb();
    await seedCatalog(query);
    await seedOrganizationRoles(query, "org-new");
    const keys = db.roles.filter((r) => r.organizationId === "org-new").map((r) => r.key);
    for (const key of RETIRED_ROLE_KEYS) expect(keys).not.toContain(key);
  });

  it("become custom roles where an organisation already has them", async () => {
    const { query, legacy } = await seededBeforeRetirement();
    await retireBuiltinRoles(query);
    for (const [key, name] of RETIRED) {
      const role = legacy[key];
      expect(role.key).toBeNull();
      expect(role.isBuiltin).toBe(false);
      // Still there under the same name — an admin decides when it goes.
      expect(role.name).toBe(name);
    }
  });

  it("keep their members and their permissions", async () => {
    const { db, query, legacy } = await seededBeforeRetirement();
    await retireBuiltinRoles(query);

    for (const [key, , perm] of RETIRED) {
      const role = legacy[key];
      expect(db.userRoles).toContainEqual({ userId: `member-of-${key}`, roleId: role.id });
      expect(db.rolePermissions).toContainEqual({ roleId: role.id, code: perm });
    }
  });

  it("leave every other built-in role, and the platform role, as they were", async () => {
    const { db, query } = await seededBeforeRetirement();
    const before = db.roles
      .filter((r) => !RETIRED_ROLE_KEYS.includes(r.key))
      .map((r) => ({ ...r }));

    await retireBuiltinRoles(query);

    const after = db.roles.filter((r) => before.some((b) => b.id === r.id));
    expect(after).toEqual(before);
    expect(after.some((r) => r.key === ROLE_KEYS.SUPER_ADMIN && r.isBuiltin)).toBe(true);
  });

  it("do not come back on a later re-seed", async () => {
    const { db, query } = await seededBeforeRetirement();
    await retireBuiltinRoles(query);
    const count = db.roles.length;

    await retireBuiltinRoles(query);
    await seedOrganizationRoles(query, "org-1");

    expect(db.roles).toHaveLength(count);
    expect(db.roles.some((r) => RETIRED_ROLE_KEYS.includes(r.key))).toBe(false);
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
    expect(roleKeyFor("u-suplead")).toBe(ROLE_KEYS.SUPPORT_LEAD);
  });

  it("gives a supporter who is not a lead no role, rather than guessing one", async () => {
    // There is no built-in role for them: an admin assigns one.
    const { db } = await seedAll();
    expect(db.userRoles.some((ur) => ur.userId === "u-sup")).toBe(false);
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

  it("gives everyone with a built-in role exactly one, and never double-grants on a re-run", async () => {
    // Everyone but the supporter who is not a lead, who has no built-in role.
    const roled = users.length - 1;
    const ctx = await seedAll();
    expect(ctx.db.userRoles).toHaveLength(roled);
    await backfillUserRoles(ctx.query);
    expect(ctx.db.userRoles).toHaveLength(roled);
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


describe("accessSeed — moving permissions to the project level", () => {
  const { migrateProjectLevelPermissions } = require("../services/accessSeed.service");

  // The state a database is in BEFORE this migration: roles that carry the old
  // project-level permissions, and no project.manageall at all.
  function legacyState() {
    const ctx = makeDb();
    const { db } = ctx;
    for (const code of [
      "project.configure", "project.create", "project.update", "project.delete",
      "bug.read", "bug.triage", "testcase.approve", "ticket.close", "livechat.send",
      "project.read", "project.export", "role.manage",
    ]) {
      db.permissions.set(code, { code, category: "old" });
    }
    const mk = (id, name, organizationId, codes) => {
      db.roles.push({ id, name, organizationId, key: null, isBuiltin: false, isLocked: false });
      for (const code of codes) db.rolePermissions.push({ roleId: id, code });
    };
    // An admin: held both of the org-wide project permissions.
    mk("r-admin", "Organisation administrator", "org-1", [
      "project.configure", "project.create", "project.update", "project.delete",
      "bug.read", "bug.triage", "project.read", "role.manage",
    ]);
    // A retired-then-custom "QA manager": held configure and create, and has members.
    mk("r-qam", "QA manager", "org-1", [
      "project.configure", "project.create", "testcase.approve", "project.read",
    ]);
    // A custom role that held ONLY the finer project permissions.
    mk("r-editor", "Project editor", "org-1", ["project.update", "project.delete", "project.read"]);
    // A custom role that held none of them.
    mk("r-reader", "Reader", "org-1", ["bug.read", "project.read", "project.export"]);
    // Another organisation's admin -- the migration is platform-wide.
    mk("r-admin-2", "Organisation administrator", "org-2", ["project.configure", "project.create"]);
    return ctx;
  }

  const held = (db, roleId) =>
    db.rolePermissions.filter((rp) => rp.roleId === roleId).map((rp) => rp.code).sort();
  const snapshot = (db) =>
    JSON.stringify(
      db.rolePermissions
        .slice()
        .sort((a, b) => (a.roleId + a.code).localeCompare(b.roleId + b.code))
    );

  it("grants project.manageall to every role that could create or manage projects", async () => {
    const { db, query } = legacyState();
    await migrateProjectLevelPermissions(query);
    expect(held(db, "r-admin")).toContain("project.manageall");
    expect(held(db, "r-qam")).toContain("project.manageall");
    expect(held(db, "r-admin-2")).toContain("project.manageall");
  });

  it("does not hand it to roles that only held the finer project permissions", async () => {
    // Editing or deleting a project is now the team lead's call; a role that had
    // only those must not be promoted to control of every project.
    const { db, query } = legacyState();
    await migrateProjectLevelPermissions(query);
    expect(held(db, "r-editor")).not.toContain("project.manageall");
    expect(held(db, "r-reader")).not.toContain("project.manageall");
  });

  it("removes every permission the catalog no longer lists, from every role", async () => {
    const { db, query } = legacyState();
    await migrateProjectLevelPermissions(query);
    const gone = [
      "project.configure", "project.create", "project.update", "project.delete",
      "bug.read", "bug.triage", "testcase.approve", "ticket.close", "livechat.send",
    ];
    for (const code of gone) expect(db.permissions.has(code)).toBe(false);
    for (const rp of db.rolePermissions) expect(gone).not.toContain(rp.code);
  });

  it("keeps everything that is still a platform permission", async () => {
    const { db, query } = legacyState();
    await migrateProjectLevelPermissions(query);
    expect(held(db, "r-admin")).toEqual(expect.arrayContaining(["project.read", "role.manage"]));
    expect(held(db, "r-reader")).toEqual(
      expect.arrayContaining(["project.read", "project.export"])
    );
  });

  it("leaves roles and their members exactly as they were", async () => {
    const { db, query } = legacyState();
    const key = (r) => [r.id, r.name, r.organizationId].join(":");
    const before = db.roles.map(key).sort();
    await migrateProjectLevelPermissions(query);
    expect(db.roles.map(key).sort()).toEqual(before);
  });

  it("is safe to run twice", async () => {
    const { db, query } = legacyState();
    await migrateProjectLevelPermissions(query);
    const once = snapshot(db);
    await migrateProjectLevelPermissions(query);
    expect(snapshot(db)).toBe(once);
  });

  it("ends with exactly the catalog's permissions", async () => {
    const { db, query } = legacyState();
    await migrateProjectLevelPermissions(query);
    expect(db.permissions.size).toBe(PERMISSIONS.length + 1); // + the wildcard row
    expect(db.permissions.has("project.manageall")).toBe(true);
  });

  it("aborts BEFORE pruning if the grant does not land, so no access is lost", async () => {
    // If the grant silently failed, the prune that follows would delete
    // project.configure -- the only record of who could manage projects -- and
    // every one of them would lose that ability with no error anywhere.
    const { db, query } = legacyState();
    const grantIsANoOp = async (sql, params) =>
      sql.includes("SELECT DISTINCT rp") ? [] : query(sql, params);

    await expect(migrateProjectLevelPermissions(grantIsANoOp)).rejects.toThrow(
      /Aborting before the prune/
    );

    // Nothing was pruned: the old permissions, and who held them, are intact.
    expect(db.permissions.has("project.configure")).toBe(true);
    expect(held(db, "r-admin")).toContain("project.configure");
    expect(held(db, "r-qam")).toContain("project.configure");
  });

  it("does not abort on a database where nobody ever held the old permissions", async () => {
    // A fresh install: nothing to preserve, so nothing to fail to grant.
    const { db, query } = makeDb();
    await expect(migrateProjectLevelPermissions(query)).resolves.toBeUndefined();
    expect(db.permissions.has("project.manageall")).toBe(true);
  });
});
