// Migration: an organisation can choose whether a request that needs a line
// manager may be submitted by someone who has none.
//
//   service_desk_settings  + require_line_manager   on by default. On: such a request
//                          can't be submitted until an administrator sets the line
//                          manager. Off: the step goes to an IT request
//                          administrator as stand-in, as it did before the check.
//
// Safe to re-run: IF NOT EXISTS.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddRequireLineManager1783620000000 implements MigrationInterface {
  name = "AddRequireLineManager1783620000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "service_desk_settings" ADD COLUMN IF NOT EXISTS "require_line_manager" boolean NOT NULL DEFAULT true`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "service_desk_settings" DROP COLUMN IF EXISTS "require_line_manager"`);
  }
}
