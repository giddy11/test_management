// Migration: change the user_role enum from (admin|lead|tester|viewer) to
// (superadmin|admin|user). Safe only if no rows still use lead/tester/viewer.
//
// NOTE: TypeORM names the enum type after the table+column. Verify the actual type
// name in your DB first:  \dT   (it is typically "users_role_enum").
// Run with: npm run migration:run   (after registering this file is automatic).
module.exports = class AlignUserRoles1782760000000 {
  name = "AlignUserRoles1782760000000";

  async up(q) {
    // Move any deprecated roles to a sensible default before tightening the enum.
    await q.query(
      `UPDATE "users" SET "role" = 'admin' WHERE "role" IN ('lead','tester','viewer')`
    );
    await q.query(`ALTER TYPE "users_role_enum" RENAME TO "users_role_enum_old"`);
    await q.query(
      `CREATE TYPE "users_role_enum" AS ENUM('superadmin','admin','user')`
    );
    await q.query(`ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT`);
    await q.query(
      `ALTER TABLE "users" ALTER COLUMN "role" TYPE "users_role_enum" USING "role"::text::"users_role_enum"`
    );
    await q.query(`ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'admin'`);
    await q.query(`DROP TYPE "users_role_enum_old"`);
  }

  async down(q) {
    await q.query(
      `ALTER TYPE "users_role_enum" RENAME TO "users_role_enum_old"`
    );
    await q.query(
      `CREATE TYPE "users_role_enum" AS ENUM('admin','lead','tester','viewer')`
    );
    await q.query(`ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT`);
    await q.query(
      `UPDATE "users" SET "role" = 'admin' WHERE "role" = 'superadmin' OR "role" = 'user'`
    );
    await q.query(
      `ALTER TABLE "users" ALTER COLUMN "role" TYPE "users_role_enum" USING "role"::text::"users_role_enum"`
    );
    await q.query(`ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'admin'`);
    await q.query(`DROP TYPE "users_role_enum_old"`);
  }
};
