// Migration: the "AI assistance" permissions — ai.use, ai.ownkey, ai.managekeys.
//
// seedCatalog adds the category and the codes, but the seed deliberately never
// grants a NEW permission to a role that already exists (see accessSeed.service).
// Without the grant below, every existing organisation would get the feature
// with nobody allowed to use it. So each new code goes to every existing
// built-in role whose catalog definition holds it — the same rule a freshly
// created organisation gets — and to nothing else. Custom roles are left for
// their admin to decide, which is the catalog's deny-by-default behaviour.
//
// Safe to re-run: inserts are ON CONFLICT DO NOTHING.
import type { MigrationInterface, QueryRunner } from "typeorm";

const { BUILTIN_ROLES } = require("../../../modules/access/catalog/permissions.catalog");
const { seedCatalog } = require("../../../modules/access/services/accessSeed.service");

const NEW_CODES = ["ai.use", "ai.ownkey", "ai.managekeys"];

export class AddAiPermissions1783510000000 implements MigrationInterface {
  name = "AddAiPermissions1783510000000";

  async up(q: QueryRunner): Promise<void> {
    const query = (sql: string, params?: unknown[]) => q.query(sql, params);
    await seedCatalog(query);

    for (const code of NEW_CODES) {
      const roleKeys: string[] = BUILTIN_ROLES.filter(
        (r: { key: string; permissions: string[]; isLocked?: boolean }) =>
          !r.isLocked && r.permissions.includes(code)
      ).map((r: { key: string }) => r.key);
      if (!roleKeys.length) continue;
      await q.query(
        `INSERT INTO "role_permissions" ("role_id", "permission_code")
         SELECT r."id", $1 FROM "roles" r
          WHERE r."key" = ANY($2::varchar[]) AND r."is_builtin" = true
         ON CONFLICT DO NOTHING`,
        [code, roleKeys]
      );
    }
  }

  async down(q: QueryRunner): Promise<void> {
    // Removing the codes cascades them off every role.
    await q.query(`DELETE FROM "permissions" WHERE "code" = ANY($1::varchar[])`, [NEW_CODES]);
    await q.query(`DELETE FROM "permission_categories" WHERE "key" = 'ai'`);
  }
}
