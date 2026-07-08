// Migration: public feedback portal — external submissions tracked per project.
// projects.feedback_token enables the public form; the feedback table stores
// submissions with a support-style lifecycle.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddFeedback1782890000000 implements MigrationInterface {
  name = "AddFeedback1782890000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "feedback_token" uuid`
    );
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_projects_feedback_token" ON "projects" ("feedback_token") WHERE "feedback_token" IS NOT NULL`
    );
    await q.query(`
      CREATE TABLE IF NOT EXISTS "feedback" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
        "type" varchar(30) NOT NULL,
        "title" varchar(200) NOT NULL,
        "description" text NOT NULL,
        "submitter_name" varchar(120) NOT NULL,
        "submitter_email" varchar(255) NOT NULL,
        "status" varchar(30) NOT NULL DEFAULT 'logged',
        "assigned_to_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "admin_response" text,
        "status_updated_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "pk_feedback" PRIMARY KEY ("id")
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_feedback_project_status_created" ON "feedback" ("project_id", "status", "created_at")`
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_feedback_assigned_to" ON "feedback" ("assigned_to_id")`
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "feedback"`);
    await q.query(`DROP INDEX IF EXISTS "idx_projects_feedback_token"`);
    await q.query(`ALTER TABLE "projects" DROP COLUMN IF EXISTS "feedback_token"`);
  }
}
