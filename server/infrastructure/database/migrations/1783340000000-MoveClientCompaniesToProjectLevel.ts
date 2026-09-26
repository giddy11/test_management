// Migration: client companies and their supporter rosters move to the project.
//
// A client company belongs to a project (client_companies.project_id), so
// creating, editing, deleting and rostering one is decided by the caller's role
// in that project -- its team lead, or a holder of project.manageall -- like the
// rest of the project-level surface (see 1783320000000-MovePermissionsToProjectLevel).
//
// company.read, company.manage and supporter.manage are therefore gone from the
// catalog. This removes them from the permissions table, and the foreign key
// clears them from every role that held one, custom roles included.
//
// Nobody loses access they should keep, so unlike that earlier migration there is
// nothing to grant first:
//
//   - the Organisation administrator holds project.manageall, which makes them the
//     team lead of every project, so they manage every company as before;
//   - a company's own IT support lead manages their own roster because of who they
//     are (users.is_support_lead and their client company), which the service has
//     always checked in addition to the permission;
//   - what changes is that a project's team lead can now manage that project's
//     companies, which is the point.
//
// Roles, users and memberships are not touched. Safe to re-run: the seed is
// idempotent, and it is also what removes the codes on a fresh deploy.
import type { MigrationInterface, QueryRunner } from "typeorm";

const { seedCatalog } = require("../../../modules/access/services/accessSeed.service");

export class MoveClientCompaniesToProjectLevel1783340000000 implements MigrationInterface {
  name = "MoveClientCompaniesToProjectLevel1783340000000";

  async up(q: QueryRunner): Promise<void> {
    await seedCatalog((sql: string, params?: unknown[]) => q.query(sql, params));
  }

  async down(): Promise<void> {
    // Deliberately a no-op. The removed permissions are gone from the catalog and
    // nothing checks them, so restoring rows would only put dead codes back into
    // the role editor. Reverting means checking out the previous release, whose
    // seed recreates them.
  }
}
