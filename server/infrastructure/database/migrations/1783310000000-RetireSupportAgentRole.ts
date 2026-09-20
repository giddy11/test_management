// Migration: Support agent is no longer a built-in role.
//
// Same treatment as QA manager and Support manager (see
// 1783300000000-RetireQaAndSupportManagerRoles): each organisation that already
// has a copy keeps it, with its members and permissions exactly as they are. It
// stops being built-in and loses its seed key, so it is an ordinary custom
// role an admin can edit, or delete once nobody holds it. Nothing is deleted,
// so no supporter loses access by deploying this.
//
// This is its own migration, rather than an edit to the earlier one, so that a
// database which has already run that one still gets converted. The conversion
// is idempotent, so a database that has not run it yet is unaffected by the
// overlap.
//
// A supporter who is not a lead now has no built-in role: an admin assigns one.
import type { MigrationInterface, QueryRunner } from "typeorm";

const { retireBuiltinRoles } = require("../../../modules/access/services/accessSeed.service");

export class RetireSupportAgentRole1783310000000 implements MigrationInterface {
  name = "RetireSupportAgentRole1783310000000";

  async up(q: QueryRunner): Promise<void> {
    await retireBuiltinRoles((sql: string, params?: unknown[]) => q.query(sql, params));
  }

  async down(): Promise<void> {
    // Deliberately a no-op: the role is still there, as a custom role, and
    // re-flagging it as built-in would let the seed overwrite an admin's edits.
  }
}
