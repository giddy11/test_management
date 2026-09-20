// scripts/seedAccess.js
// Re-seeds the permission catalog and the built-in roles. Safe to run any time:
// the catalog is refreshed, missing roles are created, and users without a role
// are granted the one their legacy users.role maps to.
//
// An admin's customisation of a built-in role's permission set is PRESERVED.
// To deliberately restore the designed sets, pass --reset-builtin-permissions.
//
// Run:  npm run seed:access  [-- --reset-builtin-permissions]
require("reflect-metadata");
const { AppDataSource } = require("../infrastructure/database/dataSource");
const { seedAccess } = require("../modules/access/services/accessSeed.service");

async function run() {
  const reset = process.argv.includes("--reset-builtin-permissions");

  await AppDataSource.initialize();
  const query = (sql, params) => AppDataSource.query(sql, params);

  if (reset) {
    console.warn(
      "[seed] --reset-builtin-permissions: built-in roles will be restored to their designed permission sets."
    );
  }

  const result = await seedAccess(query, { resetBuiltinPermissions: reset });
  console.info(
    `[seed] Access catalog seeded. Organisations: ${result.organizations}. ` +
      `Users granted a role: ${result.usersGranted}.`
  );

  await AppDataSource.destroy();
}

run().catch((err) => {
  console.error("[seed] Failed:", err.message);
  process.exit(1);
});
