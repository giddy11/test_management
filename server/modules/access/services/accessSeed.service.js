// modules/access/services/accessSeed.service.js
//
// Idempotent seeding of the permission catalog and the built-in roles.
// Shared by the migration and by `npm run seed:access`, so there is exactly one
// implementation of "what the seeded state looks like".
//
// Takes a bare `query(sql, params)` function rather than a repository, so it
// works with a TypeORM QueryRunner inside a migration and with AppDataSource
// outside one.
//
// Re-running is always safe:
//   - permissions/categories are upserted (code-owned, refreshed every run)
//   - a built-in role that already exists keeps its CURRENT permission set —
//     an admin's customisation survives every deploy. Pass
//     { resetBuiltinPermissions: true } to deliberately restore the designed sets.
const {
  WILDCARD,
  CATEGORIES,
  PERMISSIONS,
  BUILTIN_ROLES,
  roleKeyForLegacyUser,
} = require("../catalog/permissions.catalog");

// The wildcard needs a permissions row because role_permissions references it,
// but it is not part of any editor category — 'system' keeps it out of the UI.
const WILDCARD_ROW = {
  code: WILDCARD,
  category: "system",
  label: "All permissions",
  description:
    "Implies every permission in the catalog, including permissions added later.",
  warning: null,
};

async function seedCatalog(query) {
  for (const [i, c] of CATEGORIES.entries()) {
    await query(
      `INSERT INTO "permission_categories" ("key", "label", "description", "sort_order")
       VALUES ($1, $2, $3, $4)
       ON CONFLICT ("key") DO UPDATE
         SET "label" = EXCLUDED."label",
             "description" = EXCLUDED."description",
             "sort_order" = EXCLUDED."sort_order"`,
      [c.key, c.label, c.description, i]
    );
  }

  const rows = [WILDCARD_ROW, ...PERMISSIONS];
  for (const [i, p] of rows.entries()) {
    await query(
      `INSERT INTO "permissions" ("code", "category", "label", "description", "warning", "sort_order")
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT ("code") DO UPDATE
         SET "category" = EXCLUDED."category",
             "label" = EXCLUDED."label",
             "description" = EXCLUDED."description",
             "warning" = EXCLUDED."warning",
             "sort_order" = EXCLUDED."sort_order"`,
      [p.code, p.category, p.label, p.description ?? null, p.warning ?? null, i]
    );
  }

  // A permission dropped from the catalog is removed here so role editors never
  // show a dead code. The FK cascade clears any role_permissions rows with it.
  const keep = rows.map((p) => p.code);
  await query(
    `DELETE FROM "permissions" WHERE "code" <> ALL($1::varchar[])`,
    [keep]
  );
  await query(
    `DELETE FROM "permission_categories"
     WHERE "key" <> ALL($1::varchar[]) AND "key" <> 'system'`,
    [CATEGORIES.map((c) => c.key)]
  );
}

async function replacePermissions(query, roleId, codes) {
  await query(`DELETE FROM "role_permissions" WHERE "role_id" = $1`, [roleId]);
  for (const code of codes) {
    await query(
      `INSERT INTO "role_permissions" ("role_id", "permission_code") VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [roleId, code]
    );
  }
}

// Creates the role if absent. Returns { id, created }.
async function upsertRole(query, definition, organizationId, resetPermissions) {
  const existing = await query(
    organizationId === null
      ? `SELECT "id" FROM "roles" WHERE "key" = $1 AND "organization_id" IS NULL`
      : `SELECT "id" FROM "roles" WHERE "key" = $1 AND "organization_id" = $2`,
    organizationId === null ? [definition.key] : [definition.key, organizationId]
  );

  if (existing.length) {
    const id = existing[0].id;
    // The name and flags are code-owned for built-ins; the permission set is not.
    await query(
      `UPDATE "roles"
         SET "name" = $2, "description" = $3, "is_builtin" = true, "is_locked" = $4
       WHERE "id" = $1`,
      [id, definition.name, definition.description, !!definition.isLocked]
    );
    if (resetPermissions || definition.isLocked) {
      // A locked role is never admin-editable, so its set is always authoritative.
      await replacePermissions(query, id, definition.permissions);
    }
    return { id, created: false };
  }

  const inserted = await query(
    `INSERT INTO "roles" ("organization_id", "key", "name", "description", "is_builtin", "is_locked")
     VALUES ($1, $2, $3, $4, true, $5)
     RETURNING "id"`,
    [
      organizationId,
      definition.key,
      definition.name,
      definition.description,
      !!definition.isLocked,
    ]
  );
  const id = inserted[0].id;
  await replacePermissions(query, id, definition.permissions);
  return { id, created: true };
}

// The single platform-level role (organization_id IS NULL).
async function seedPlatformRole(query, { resetBuiltinPermissions = false } = {}) {
  const def = BUILTIN_ROLES.find((r) => r.platformWide);
  return upsertRole(query, def, null, resetBuiltinPermissions);
}

// Every non-platform built-in role, for one organisation.
async function seedOrganizationRoles(
  query,
  organizationId,
  { resetBuiltinPermissions = false } = {}
) {
  const created = {};
  for (const def of BUILTIN_ROLES) {
    if (def.platformWide) continue;
    const { id } = await upsertRole(query, def, organizationId, resetBuiltinPermissions);
    created[def.key] = id;
  }
  return created;
}

// Seeds built-in roles for every organisation that currently has users.
async function seedAllOrganizations(query, options = {}) {
  const orgs = await query(
    `SELECT DISTINCT "organization_id" AS id FROM "users"
     WHERE "organization_id" IS NOT NULL AND "deleted_at" IS NULL`
  );
  for (const row of orgs) {
    await seedOrganizationRoles(query, row.id, options);
  }
  return orgs.length;
}

// Grants every user the role their legacy users.role maps to, unless they
// already hold a role. Never revokes anything.
async function backfillUserRoles(query) {
  // `is_team_lead` matters: under the old model a plain "user" who led any
  // project could manage it, triage its bugs and approve its work. That is the
  // Test lead role, not QA engineer — mapping them to QA engineer would
  // silently take capabilities away from people who have them today.
  const users = await query(
    `SELECT u."id", u."role", u."organization_id", u."is_support_lead",
            EXISTS (
              SELECT 1 FROM "project_members" pm
               WHERE pm."user_id" = u."id" AND pm."role" = 'team_lead'
            ) AS "is_team_lead"
       FROM "users" u
      WHERE u."deleted_at" IS NULL
        AND NOT EXISTS (SELECT 1 FROM "user_roles" ur WHERE ur."user_id" = u."id")`
  );

  let granted = 0;
  for (const u of users) {
    const key = roleKeyForLegacyUser(u.role, u.is_support_lead, u.is_team_lead);
    // Prefer the user's own organisation's copy; fall back to the platform-level
    // role, which is how super_admin (organization_id IS NULL) resolves.
    const rows = await query(
      `SELECT "id" FROM "roles"
        WHERE "key" = $1 AND ("organization_id" = $2 OR "organization_id" IS NULL)
        ORDER BY ("organization_id" IS NULL) ASC
        LIMIT 1`,
      [key, u.organization_id]
    );
    if (!rows.length) continue;
    await query(
      `INSERT INTO "user_roles" ("user_id", "role_id") VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [u.id, rows[0].id]
    );
    granted += 1;
  }
  return granted;
}

// The whole seed, in order. `query` must be bound to a live connection.
async function seedAccess(query, options = {}) {
  await seedCatalog(query);
  await seedPlatformRole(query, options);
  const orgs = await seedAllOrganizations(query, options);
  const granted = await backfillUserRoles(query);
  return { organizations: orgs, usersGranted: granted };
}

module.exports = {
  seedAccess,
  seedCatalog,
  seedPlatformRole,
  seedOrganizationRoles,
  seedAllOrganizations,
  backfillUserRoles,
  WILDCARD_ROW,
};
