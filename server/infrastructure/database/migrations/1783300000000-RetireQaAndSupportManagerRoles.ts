// Migration: QA manager and Support manager are no longer built-in roles.
// (It converts whatever RETIRED_ROLE_KEYS lists when it runs, which since
// 1783310000000-RetireSupportAgentRole includes Support agent too.)
//
// Each organisation that already has a copy keeps it, with its members and
// permissions exactly as they are. It stops being built-in and loses its seed
// key, so it is an ordinary custom role: an admin can rename it, edit it, or
// delete it once nobody holds it. Nothing is deleted here, so nobody loses
// access by deploying this.
//
// Organisations created from now on are simply not given them.
import type { MigrationInterface, QueryRunner } from "typeorm";

const { retireBuiltinRoles } = require("../../../modules/access/services/accessSeed.service");

export class RetireQaAndSupportManagerRoles1783300000000 implements MigrationInterface {
  name = "RetireQaAndSupportManagerRoles1783300000000";

  async up(q: QueryRunner): Promise<void> {
    await retireBuiltinRoles((sql: string, params?: unknown[]) => q.query(sql, params));
  }

  async down(): Promise<void> {
    // Deliberately a no-op. The roles are still there, as custom roles, and
    // re-flagging them as built-in would turn an admin's later edits and
    // renames into something the seed overwrites.
  }
}
