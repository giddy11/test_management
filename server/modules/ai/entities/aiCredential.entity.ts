// modules/ai/entities/aiCredential.entity.ts
// A saved AI provider API key. Two kinds of owner:
//   - the ORGANISATION (user_id NULL): set by an org admin, used by every
//     member who has no key of their own;
//   - a USER (user_id set): their own key, which wins over the organisation's.
// One key per provider per owner, and at most one `is_active` per owner.
//
// The key itself is only ever stored sealed (shared/utils/secretBox.ts), bound
// to "<organizationId>:<userId|org>:<provider>". It is never returned to a
// client — only keyLast4.
import { EntitySchema } from "typeorm";
import type { AiProviderId } from "../../../infrastructure/ai/aiProvider";

export interface AiCredential {
  id: string;
  organizationId: string;
  userId: string | null;
  provider: AiProviderId;
  model: string;
  // Optional cheaper model for chat; drafts always use `model`.
  chatModel: string | null;
  // { [feature]: modelId } — features pinned to THIS key. A feature is pinned
  // to at most one of an owner's keys.
  featureModels: Record<string, string>;
  // Ollama only: the server address (validated by checkServerAddress).
  baseUrl: string | null;
  keyCiphertext: string;
  keyLast4: string;
  isActive: boolean;
  updatedById: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  user?: unknown;
  updatedBy?: unknown;
}

const AiCredential = new EntitySchema<AiCredential>({
  name: "AiCredential",
  tableName: "ai_credentials",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    organizationId: { name: "organization_id", type: "uuid" },
    userId: { name: "user_id", type: "uuid", nullable: true },
    provider: { type: "varchar", length: 20 },
    model: { type: "varchar", length: 200 },
    chatModel: { name: "chat_model", type: "varchar", length: 200, nullable: true },
    featureModels: { name: "feature_models", type: "jsonb", default: () => "'{}'::jsonb" },
    baseUrl: { name: "base_url", type: "varchar", length: 500, nullable: true },
    keyCiphertext: { name: "key_ciphertext", type: "text" },
    keyLast4: { name: "key_last4", type: "varchar", length: 4 },
    isActive: { name: "is_active", type: "boolean", default: false },
    updatedById: { name: "updated_by_id", type: "uuid", nullable: true },
    createdAt: { name: "created_at", type: "timestamptz", createDate: true },
    updatedAt: { name: "updated_at", type: "timestamptz", updateDate: true },
    deletedAt: { name: "deleted_at", type: "timestamptz", deleteDate: true, nullable: true },
  },
  relations: {
    user: {
      type: "many-to-one",
      target: "User",
      joinColumn: { name: "user_id" },
      nullable: true,
      onDelete: "CASCADE",
    },
    updatedBy: {
      type: "many-to-one",
      target: "User",
      joinColumn: { name: "updated_by_id" },
      nullable: true,
      onDelete: "SET NULL",
    },
  },
  indices: [
    {
      name: "uq_ai_credentials_org_provider",
      columns: ["organizationId", "provider"],
      unique: true,
      where: `"user_id" IS NULL AND "deleted_at" IS NULL`,
    },
    {
      name: "uq_ai_credentials_user_provider",
      columns: ["userId", "provider"],
      unique: true,
      where: `"user_id" IS NOT NULL AND "deleted_at" IS NULL`,
    },
  ],
});

export { AiCredential };
