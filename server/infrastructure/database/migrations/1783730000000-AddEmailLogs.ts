// Migration: the email log — one row per recipient of every email the system
// sent, tried to send, or deliberately skipped, and which mail provider was
// responsible. Read by platform admins only (emaillog.read).
//
// - organization_id is a plain nullable uuid with NO foreign key: there is no
//   organisations table here, an organisation is just the organization_id the
//   users in it share. The email log names it the way the Organisations page does.
// - status says what the sender knows, not what the inbox did: 'sent' means a
//   provider ACCEPTED the message, which does not prove it was delivered.
// - There is no body or attachment column, on purpose. The message text never
//   reaches this table.
// - emaillog.read: the platform-only permission. seedCatalog adds it; no role is
//   granted it, because it is PLATFORM_ONLY and the super administrator's
//   wildcard already covers it.
//
// Safe to re-run: IF NOT EXISTS, and seedCatalog upserts.
import type { MigrationInterface, QueryRunner } from "typeorm";

const { seedCatalog } = require("../../../modules/access/services/accessSeed.service");

// Exported so the integration spec builds its throwaway database from exactly
// these statements, not a copy of them.
export const EMAIL_LOGS_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS "email_logs" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "organization_id" uuid NULL,
    "to_email" varchar(255) NOT NULL,
    "subject" varchar(300) NOT NULL,
    "kind" varchar(40) NULL,
    "status" varchar(10) NOT NULL,
    "provider" varchar(30) NULL,
    "fallback" boolean NOT NULL DEFAULT false,
    "provider_message_id" varchar(150) NULL,
    "note" varchar(600) NULL,
    CONSTRAINT "chk_email_logs_status" CHECK ("status" IN ('sent', 'failed', 'skipped'))
  )`,
  `CREATE INDEX IF NOT EXISTS "idx_email_logs_created_at" ON "email_logs" ("created_at" DESC)`,
  `CREATE INDEX IF NOT EXISTS "idx_email_logs_status_created_at" ON "email_logs" ("status", "created_at" DESC)`,
  `CREATE INDEX IF NOT EXISTS "idx_email_logs_provider_created_at" ON "email_logs" ("provider", "created_at" DESC)`,
];

export class AddEmailLogs1783730000000 implements MigrationInterface {
  name = "AddEmailLogs1783730000000";

  async up(q: QueryRunner): Promise<void> {
    for (const statement of EMAIL_LOGS_DDL) await q.query(statement);

    const query = (sql: string, params?: unknown[]) => q.query(sql, params);
    await seedCatalog(query);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DELETE FROM "permissions" WHERE "code" = 'emaillog.read'`);
    await q.query(`DROP TABLE IF EXISTS "email_logs"`);
  }
}
