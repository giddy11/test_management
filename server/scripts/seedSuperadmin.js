// scripts/seedSuperadmin.js
// Creates (or promotes) the platform superadmin — the developer account.
// Reads credentials from env: SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD,
// SUPERADMIN_FIRST_NAME, SUPERADMIN_LAST_NAME.
//
// Run:  node scripts/seedSuperadmin.js   (or npm run seed:superadmin)
require("reflect-metadata");
const crypto = require("crypto");
const { AppDataSource } = require("../infrastructure/database/dataSource");
const { User } = require("../modules/auth/entities/user.entity");
const { UserRole, AuthProvider } = require("../config/constants");
const { hashPassword } = require("../shared/utils/password");

async function run() {
  const email = process.env.SUPERADMIN_EMAIL;
  const password = process.env.SUPERADMIN_PASSWORD;
  if (!email || !password) {
    console.error(
      "Set SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD (env) before running this script."
    );
    process.exit(1);
  }

  await AppDataSource.initialize();
  const users = AppDataSource.getRepository(User);

  const existing = await users.findOne({ where: { email } });
  if (existing) {
    await users.update(existing.id, {
      role: UserRole.SUPERADMIN,
      isEmailVerified: true,
    });
    console.info(`[seed] Promoted existing user ${email} to superadmin.`);
  } else {
    await users.save(
      users.create({
        firstName: process.env.SUPERADMIN_FIRST_NAME || "Super",
        lastName: process.env.SUPERADMIN_LAST_NAME || "Admin",
        companyName: "TestMate",
        email,
        password: await hashPassword(password),
        role: UserRole.SUPERADMIN,
        provider: AuthProvider.LOCAL,
        isEmailVerified: true,
        organizationId: crypto.randomUUID(),
      })
    );
    console.info(`[seed] Created superadmin ${email}.`);
  }

  await AppDataSource.destroy();
}

run().catch((err) => {
  console.error("[seed] Failed:", err.message);
  process.exit(1);
});
