// Migration: most permissions move from the platform to the project.
//
// The review concluded that roles, people management, viewing all projects and
// exporting project data stay at the platform level, and that everything about
// working INSIDE a project -- suites, cases, runs, results, bugs, feature
// requests, tickets, live chat, creating / deleting a project, project
// membership -- is decided by the person's role in that project
// (project_members.role) instead.
//
// What this does to existing data:
//
//   1. Adds project.manageall (what project.configure and project.create became)
//      and grants it to every role that held either, so nobody who could create
//      or manage projects loses that by deploying this. See
//      migrateProjectLevelPermissions for why it must precede step 2.
//   2. Removes the permissions the catalog no longer lists. The foreign key clears
//      them from every role, custom ones included. Nothing they gated is checked
//      any more, so this removes no live access: what those people can do in a
//      project now comes from their role in that project.
//
// Roles, users and project memberships are not touched. Safe to re-run.
import type { MigrationInterface, QueryRunner } from "typeorm";

const {
  migrateProjectLevelPermissions,
} = require("../../../modules/access/services/accessSeed.service");

export class MovePermissionsToProjectLevel1783320000000 implements MigrationInterface {
  name = "MovePermissionsToProjectLevel1783320000000";

  async up(q: QueryRunner): Promise<void> {
    await migrateProjectLevelPermissions((sql: string, params?: unknown[]) =>
      q.query(sql, params)
    );
  }

  async down(): Promise<void> {
    // Deliberately a no-op. The removed permissions are gone from the catalog and
    // nothing checks them, so restoring rows would only put dead codes back into
    // the role editor. Reverting means checking out the previous release, whose
    // seed recreates them.
  }
}
