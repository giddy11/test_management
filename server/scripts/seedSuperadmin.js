// scripts/seedSuperadmin.js
// Creates (or promotes) the platform superadmins — the developer accounts.
// Reads from env:
//   SUPERADMIN_EMAIL       one or more emails, separated by commas or semicolons
//                          (e.g. "a@example.com, b@example.com")
//   SUPERADMIN_PASSWORD    the password given to accounts this script CREATES.
//                          Accounts that already exist keep their own password.
//   SUPERADMIN_FIRST_NAME, SUPERADMIN_LAST_NAME   names for created accounts
//
// Each account gets the legacy users.role = superadmin AND the locked
// "Super administrator" role (wildcard permission). Permissions come from
// user_roles, so the second part is what actually grants access. Safe to
// re-run: nothing is duplicated and nothing is revoked.
//
// Run:  node scripts/seedSuperadmin.js   (or npm run seed:superadmin)
require("reflect-metadata");
const crypto = require("crypto");
const { AppDataSource } = require("../infrastructure/database/dataSource");
const { User } = require("../modules/auth/entities/user.entity");
const { UserRole, AuthProvider } = require("../config/constants");
const { hashPassword } = require("../shared/utils/password");
const { ROLE_KEYS } = require("../modules/access/catalog/permissions.catalog");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseEmails(raw) {
  const seen = new Set();
  const emails = [];
  for (const part of (raw || "").split(/[,;]/)) {
    const email = part.trim();
    if (!email) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    emails.push(email);
  }
  return emails;
}

// The locked platform role lives outside any organisation.
async function superAdminRoleId() {
  const rows = await AppDataSource.query(
    `SELECT "id" FROM "roles" WHERE "key" = $1 AND "organization_id" IS NULL LIMIT 1`,
    [ROLE_KEYS.SUPER_ADMIN]
  );
  return rows[0]?.id ?? null;
}

async function grantSuperAdminRole(userId, roleId) {
  await AppDataSource.query(
    `INSERT INTO "user_roles" ("user_id", "role_id") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [userId, roleId]
  );
}

async function run() {
  const emails = parseEmails(process.env.SUPERADMIN_EMAIL);
  const password = process.env.SUPERADMIN_PASSWORD;
  if (!emails.length || !password) {
    console.error(
      "Set SUPERADMIN_EMAIL (one or more, comma-separated) and SUPERADMIN_PASSWORD (env) before running this script."
    );
    process.exit(1);
  }
  const invalid = emails.filter((e) => !EMAIL_PATTERN.test(e));
  if (invalid.length) {
    console.error(`[seed] Not valid email addresses: ${invalid.join(", ")}`);
    process.exit(1);
  }

  await AppDataSource.initialize();
  const users = AppDataSource.getRepository(User);

  const roleId = await superAdminRoleId();
  if (!roleId) {
    console.warn(
      "[seed] The Super administrator role doesn't exist yet. Run `npm run seed:access` (or the migrations), then run this script again to grant it."
    );
  }

  // Hashed once; only used for accounts that don't exist yet.
  let passwordHash = null;

  for (const email of emails) {
    // Emails are stored as typed, so match without caring about case.
    const existing = await users
      .createQueryBuilder("u")
      .where("LOWER(u.email) = LOWER(:email)", { email })
      .getOne();

    let userId;
    if (existing) {
      await users.update(existing.id, { role: UserRole.SUPERADMIN, isEmailVerified: true });
      userId = existing.id;
      console.info(`[seed] Promoted existing user ${existing.email} to superadmin.`);
    } else {
      passwordHash = passwordHash ?? (await hashPassword(password));
      const created = await users.save(
        users.create({
          firstName: process.env.SUPERADMIN_FIRST_NAME || "Super",
          lastName: process.env.SUPERADMIN_LAST_NAME || "Admin",
          companyName: "ServiceDesk4u",
          email,
          password: passwordHash,
          role: UserRole.SUPERADMIN,
          provider: AuthProvider.LOCAL,
          isEmailVerified: true,
          organizationId: crypto.randomUUID(),
        })
      );
      userId = created.id;
      console.info(`[seed] Created superadmin ${email}.`);
    }

    if (roleId) await grantSuperAdminRole(userId, roleId);
  }

  await AppDataSource.destroy();
}

run().catch((err) => {
  console.error("[seed] Failed:", err.message);
  process.exit(1);
});
