// Migration: per-project member roles.
// The project_members join table may already exist (created by dev synchronize
// for the old implicit many-to-many), so everything here is idempotent.
// Adds the role column (member | team_lead) that ProjectMember now maps.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddProjectMemberRole1782860000000 implements MigrationInterface {
  name = "AddProjectMemberRole1782860000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "project_members" (
        "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "pk_project_members" PRIMARY KEY ("project_id", "user_id")
      )
    `);
    await q.query(
      `ALTER TABLE "project_members" ADD COLUMN IF NOT EXISTS "role" varchar(20) NOT NULL DEFAULT 'member'`
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_pm_user" ON "project_members" ("user_id")`
    );
  }

  async down(q: QueryRunner): Promise<void> {
    // The table itself may predate this migration, so only the column is reverted.
    await q.query(`ALTER TABLE "project_members" DROP COLUMN IF EXISTS "role"`);
    await q.query(`DROP INDEX IF EXISTS "idx_pm_user"`);
  }
}
