// Migration: one-time codes emailed to a ticket submitter so they can view
// every ticket they've ever raised (across all projects/companies) without an
// account — see FeedbackService.requestMyTicketsCode / listMyTickets. A
// dedicated table rather than reusing auth's otp_codes, since that column is
// a native Postgres enum (altering it to add a new type is riskier than a new
// table) and this is a feedback-module concern, not an auth one.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddFeedbackLookupCodes1783150000000 implements MigrationInterface {
  name = "AddFeedbackLookupCodes1783150000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "feedback_lookup_codes" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "email" varchar(255) NOT NULL,
        "code_hash" varchar(255) NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "consumed_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(`
      CREATE INDEX IF NOT EXISTS "idx_feedback_lookup_codes_email" ON "feedback_lookup_codes" ("email")
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "feedback_lookup_codes"`);
  }
}
