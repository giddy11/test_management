// Migration: Viewer is no longer a built-in role.
//
// Same treatment as QA manager, Support manager and Support agent (see
// 1783300000000-RetireQaAndSupportManagerRoles and
// 1783310000000-RetireSupportAgentRole): each organisation that already has a
// copy keeps it, with its members and permissions exactly as they are. It stops
// being built-in and loses its seed key, so it is an ordinary custom role an admin
// can edit, or delete once nobody holds it. Nothing is deleted, so nobody who was
// given it loses access by deploying this.
//
// Organisations created from now on are simply not given it. A read-only
// stakeholder is a custom role holding project.readall: ProjectService resolves
// anyone with org-wide read who is not on a project to a read-only tier, so such a
// role can see every project and change nothing.
//
// This is its own migration, rather than an edit to the earlier ones, so that a
// database which has already run them still gets converted. The conversion is
// idempotent, so a database that has not run them yet is unaffected by the
// overlap.
import type { MigrationInterface, QueryRunner } from "typeorm";

const { retireBuiltinRoles } = require("../../../modules/access/services/accessSeed.service");

export class RetireViewerRole1783330000000 implements MigrationInterface {
  name = "RetireViewerRole1783330000000";

  async up(q: QueryRunner): Promise<void> {
    await retireBuiltinRoles((sql: string, params?: unknown[]) => q.query(sql, params));
  }

  async down(): Promise<void> {
    // Deliberately a no-op: the role is still there, as a custom role, and
    // re-flagging it as built-in would let the seed overwrite an admin's edits.
  }
}
