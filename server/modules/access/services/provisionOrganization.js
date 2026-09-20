// modules/access/services/provisionOrganization.js
// Gives a brand-new organisation its own copy of the built-in roles and makes
// the registering admin its Organisation administrator.
//
// Without this a freshly registered admin would hold no permissions at all —
// deny-by-default means an organisation with no roles is an organisation
// nobody can use.
const { AppDataSource } = require("../../../infrastructure/database/dataSource");
const {
  seedOrganizationRoles,
} = require("./accessSeed.service");
const { AccessRepository } = require("../repositories/access.repository");
const { ROLE_KEYS } = require("../catalog/permissions.catalog");
const cache = require("../../../shared/access/permissionCache");

// Never let a provisioning failure swallow a successful registration — the
// account exists either way, and `npm run seed:access` repairs it. Logged loudly.
async function provisionOrganizationAccess(user) {
  if (!user?.organizationId) return;
  try {
    const query = (sql, params) => AppDataSource.query(sql, params);
    await seedOrganizationRoles(query, user.organizationId);

    const repo = AccessRepository.Instance;
    const adminRole = await repo.findRoleByKey(user.organizationId, ROLE_KEYS.ORG_ADMIN);
    if (adminRole) {
      await repo.setUserRoles(user.id, [adminRole.id], null);
      cache.invalidate(user.id);
    }
  } catch (err) {
    console.error(
      `[access] Failed to provision roles for organisation ${user.organizationId}:`,
      err.message
    );
  }
}

module.exports = { provisionOrganizationAccess };
