// Migration: add the organization_id grouping column to users (additive, nullable).
module.exports = class AddUserOrganizationId1782761000000 {
  name = "AddUserOrganizationId1782761000000";

  async up(q) {
    await q.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "organization_id" uuid`);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_users_organization_id" ON "users" ("organization_id")`
    );
  }

  async down(q) {
    await q.query(`DROP INDEX IF EXISTS "idx_users_organization_id"`);
    await q.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "organization_id"`);
  }
};
