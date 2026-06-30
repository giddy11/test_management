// Migration: org-shared access + multi-user test case assignment.
// 1) projects.organization_id (backfilled from each project owner's org)
// 2) test_case_assignees join table (test case ↔ users, many-to-many)
module.exports = class AddProjectOrgAndAssignees1782770000000 {
  name = "AddProjectOrgAndAssignees1782770000000";

  async up(q) {
    await q.query(`ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "organization_id" uuid`);
    await q.query(
      `UPDATE "projects" p SET "organization_id" = u."organization_id"
       FROM "users" u WHERE p."owner_id" = u."id" AND p."organization_id" IS NULL`
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_projects_org_created" ON "projects" ("organization_id", "created_at")`
    );

    await q.query(`
      CREATE TABLE IF NOT EXISTS "test_case_assignees" (
        "test_case_id" uuid NOT NULL REFERENCES "test_cases"("id") ON DELETE CASCADE,
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "pk_test_case_assignees" PRIMARY KEY ("test_case_id", "user_id")
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_tca_user" ON "test_case_assignees" ("user_id")`
    );
  }

  async down(q) {
    await q.query(`DROP TABLE IF EXISTS "test_case_assignees"`);
    await q.query(`DROP INDEX IF EXISTS "idx_projects_org_created"`);
    await q.query(`ALTER TABLE "projects" DROP COLUMN IF EXISTS "organization_id"`);
  }
};
