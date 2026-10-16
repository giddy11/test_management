// Migration: the AI foundation — saved provider keys and the usage log.
//
// ai_credentials holds API keys owned by an organisation (user_id NULL, set by
// an org admin) or by one user (their own key, which wins). The key is stored
// sealed (AES-256-GCM, see shared/utils/secretBox.ts) and only its last four
// characters are readable. One key per provider per owner — the two partial
// unique indexes — and soft-deleted rows don't count, so a removed key can be
// added again.
//
// ai_usage_logs is append-only and holds counts only (tokens, timing, outcome):
// no prompt or reply content is ever stored.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddAiCredentialsAndUsage1783500000000 implements MigrationInterface {
  name = "AddAiCredentialsAndUsage1783500000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "ai_credentials" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL,
        "user_id" uuid REFERENCES "users"("id") ON DELETE CASCADE,
        "provider" varchar(20) NOT NULL,
        "model" varchar(200) NOT NULL,
        "chat_model" varchar(200),
        "feature_models" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "base_url" varchar(500),
        "key_ciphertext" text NOT NULL,
        "key_last4" varchar(4) NOT NULL,
        "is_active" boolean NOT NULL DEFAULT false,
        "updated_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "chk_ai_credentials_provider" CHECK ("provider" IN ('anthropic', 'openai', 'gemini', 'ollama'))
      )
    `);
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_ai_credentials_org_provider" ON "ai_credentials" ("organization_id", "provider") WHERE "user_id" IS NULL AND "deleted_at" IS NULL`
    );
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_ai_credentials_user_provider" ON "ai_credentials" ("user_id", "provider") WHERE "user_id" IS NOT NULL AND "deleted_at" IS NULL`
    );

    await q.query(`
      CREATE TABLE IF NOT EXISTS "ai_usage_logs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL,
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "key_source" varchar(20) NOT NULL,
        "provider" varchar(20) NOT NULL,
        "model" varchar(200) NOT NULL,
        "feature" varchar(50) NOT NULL,
        "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
        "input_tokens" int NOT NULL DEFAULT 0,
        "output_tokens" int NOT NULL DEFAULT 0,
        "status" varchar(10) NOT NULL,
        "error_kind" varchar(30),
        "duration_ms" int NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_ai_usage_logs_key_source" CHECK ("key_source" IN ('user', 'organization')),
        CONSTRAINT "chk_ai_usage_logs_status" CHECK ("status" IN ('ok', 'error'))
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_ai_usage_logs_org_created" ON "ai_usage_logs" ("organization_id", "created_at")`
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_ai_usage_logs_user_created" ON "ai_usage_logs" ("user_id", "created_at")`
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "ai_usage_logs"`);
    await q.query(`DROP TABLE IF EXISTS "ai_credentials"`);
  }
}
