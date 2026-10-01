// Migration: a user's own phone number (E.164) — a general profile field.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddUserPhoneNumber1783460000000 implements MigrationInterface {
  name = "AddUserPhoneNumber1783460000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone_number" varchar(20)`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "phone_number"`);
  }
}
