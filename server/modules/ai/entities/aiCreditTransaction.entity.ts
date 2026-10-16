// modules/ai/entities/aiCreditTransaction.entity.ts
// The credit ledger. Append-only: every balance change writes exactly one row
// in the same transaction, with the balance it left behind. "Clearing history"
// only sets hidden_at on the holder's view — the ledger stays as the record.
import { EntitySchema } from "typeorm";

export const AI_CREDIT_TRANSACTION_TYPES = ["grant", "adjustment", "usage", "refund", "purchase"] as const;
export type AiCreditTransactionType = (typeof AI_CREDIT_TRANSACTION_TYPES)[number];

export interface AiCreditTransaction {
  id: string;
  userId: string; // whose balance moved
  organizationId: string;
  type: AiCreditTransactionType;
  amount: number; // signed: negative spends, positive tops up
  balanceAfter: number;
  feature: string | null;
  note: string | null; // admin's note on a grant
  // Who spent it, when that isn't the holder (reserved for shared-AI payers).
  usedById: string | null;
  // The project the request was about.
  projectId: string | null;
  detail: string | null;
  actorId: string | null; // who made the change (the admin, for a grant)
  hiddenAt: Date | null;
  createdAt: Date;
  user?: unknown;
  usedBy?: unknown;
  project?: unknown;
  actor?: unknown;
}

const AiCreditTransaction = new EntitySchema<AiCreditTransaction>({
  name: "AiCreditTransaction",
  tableName: "ai_credit_transactions",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    userId: { name: "user_id", type: "uuid" },
    organizationId: { name: "organization_id", type: "uuid" },
    type: { type: "varchar", length: 20 },
    amount: { type: "int" },
    balanceAfter: { name: "balance_after", type: "int" },
    feature: { type: "varchar", length: 50, nullable: true },
    note: { type: "varchar", length: 300, nullable: true },
    usedById: { name: "used_by_id", type: "uuid", nullable: true },
    projectId: { name: "project_id", type: "uuid", nullable: true },
    detail: { type: "varchar", length: 300, nullable: true },
    actorId: { name: "actor_id", type: "uuid", nullable: true },
    hiddenAt: { name: "hidden_at", type: "timestamptz", nullable: true },
    createdAt: { name: "created_at", type: "timestamptz", createDate: true },
  },
  checks: [
    {
      name: "chk_ai_credit_transactions_type",
      expression: `"type" IN ('grant', 'adjustment', 'usage', 'refund', 'purchase')`,
    },
  ],
  relations: {
    user: { type: "many-to-one", target: "User", joinColumn: { name: "user_id" }, onDelete: "CASCADE" },
    usedBy: { type: "many-to-one", target: "User", joinColumn: { name: "used_by_id" }, nullable: true, onDelete: "SET NULL" },
    project: { type: "many-to-one", target: "Project", joinColumn: { name: "project_id" }, nullable: true, onDelete: "SET NULL" },
    actor: { type: "many-to-one", target: "User", joinColumn: { name: "actor_id" }, nullable: true, onDelete: "SET NULL" },
  },
  indices: [
    { name: "idx_ai_credit_transactions_user_created", columns: ["userId", "createdAt"] },
    { name: "idx_ai_credit_transactions_org_created", columns: ["organizationId", "createdAt"] },
  ],
});

export { AiCreditTransaction };
