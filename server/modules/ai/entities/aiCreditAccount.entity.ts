// modules/ai/entities/aiCreditAccount.entity.ts
// A user's AI credit balance — spent only when a request runs on the
// organisation's key. The balance changes ONLY through
// AiCreditRepository.applyDelta (one atomic UPDATE + a ledger row), and the
// CHECK constraint makes a negative balance impossible even then.
import { EntitySchema } from "typeorm";

export interface AiCreditAccount {
  id: string;
  userId: string;
  organizationId: string;
  balance: number;
  createdAt: Date;
  updatedAt: Date;
  user?: unknown;
}

const AiCreditAccount = new EntitySchema<AiCreditAccount>({
  name: "AiCreditAccount",
  tableName: "ai_credit_accounts",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    userId: { name: "user_id", type: "uuid", unique: true },
    organizationId: { name: "organization_id", type: "uuid" },
    balance: { type: "int", default: 0 },
    createdAt: { name: "created_at", type: "timestamptz", createDate: true },
    updatedAt: { name: "updated_at", type: "timestamptz", updateDate: true },
  },
  checks: [{ name: "chk_ai_credit_accounts_balance", expression: `"balance" >= 0` }],
  relations: {
    user: {
      type: "many-to-one",
      target: "User",
      joinColumn: { name: "user_id" },
      onDelete: "CASCADE",
    },
  },
  indices: [{ name: "idx_ai_credit_accounts_org", columns: ["organizationId"] }],
});

export { AiCreditAccount };
