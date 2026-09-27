// Migration: decouple "is this public link active" from "what is its token".
//
// setFeedbackLink / setWidgetLink (project-level and client-company-level)
// used to double as both an on/off switch and a rotate-the-secret action:
// re-enabling always minted a fresh randomUUID(), so anything already pasted
// or shared with the old token broke. That surprises anyone who just wants
// to pause the form/widget and bring back the exact same link later — which
// is what disable-then-enable reads as.
//
// feedback_enabled / live_chat_enabled now own the on/off state; the token
// columns become permanent once first minted and only ever resolve (see
// ProjectRepository.findByFeedbackToken/findByLiveChatToken and
// ClientCompanyRepository.findByFeedbackToken) or get exposed to the owning
// team (see project.dto.ts / clientCompany.dto.ts) while their flag is true.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddFeedbackAndLiveChatEnabledFlags1783390000000 implements MigrationInterface {
  name = "AddFeedbackAndLiveChatEnabledFlags1783390000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "feedback_enabled" boolean NOT NULL DEFAULT false`
    );
    await q.query(
      `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "live_chat_enabled" boolean NOT NULL DEFAULT false`
    );
    await q.query(
      `ALTER TABLE "client_companies" ADD COLUMN IF NOT EXISTS "feedback_enabled" boolean NOT NULL DEFAULT false`
    );

    // Backfill: a project/company that already has a token today is, under
    // the old rules, currently enabled — don't silently turn every existing
    // form/widget off underneath whoever already has one embedded/shared.
    await q.query(`UPDATE "projects" SET "feedback_enabled" = true WHERE "feedback_token" IS NOT NULL`);
    await q.query(`UPDATE "projects" SET "live_chat_enabled" = true WHERE "live_chat_token" IS NOT NULL`);
    await q.query(
      `UPDATE "client_companies" SET "feedback_enabled" = true WHERE "feedback_token" IS NOT NULL`
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "client_companies" DROP COLUMN IF EXISTS "feedback_enabled"`);
    await q.query(`ALTER TABLE "projects" DROP COLUMN IF EXISTS "live_chat_enabled"`);
    await q.query(`ALTER TABLE "projects" DROP COLUMN IF EXISTS "feedback_enabled"`);
  }
}
