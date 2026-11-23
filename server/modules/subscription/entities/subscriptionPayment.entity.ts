// modules/subscription/entities/subscriptionPayment.entity.ts
// A payment the platform owner recorded by hand: bank transfer, cash, cheque
// and so on. Append-only: a mistake is corrected by recording another entry
// or by changing the plan, never by editing history.
import { EntitySchema } from "typeorm";
import type { PaymentMethod, PlanKey } from "../domain/planCatalog";

export interface SubscriptionPayment {
  id: string;
  organizationId: string;
  planKey: PlanKey;
  // Stored as numeric; TypeORM hands it back as a string.
  amount: string;
  currency: string;
  method: PaymentMethod;
  reference: string | null;
  paidAt: Date;
  periodStart: Date;
  periodEnd: Date;
  note: string | null;
  recordedBy: string | null;
  createdAt: Date;
}

const SubscriptionPayment = new EntitySchema<SubscriptionPayment>({
  name: "SubscriptionPayment",
  tableName: "subscription_payments",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    organizationId: { name: "organization_id", type: "uuid" },
    planKey: { name: "plan_key", type: "varchar", length: 20 },
    amount: { type: "numeric", precision: 14, scale: 2 },
    currency: { type: "varchar", length: 10 },
    method: { type: "varchar", length: 30 },
    reference: { type: "varchar", length: 120, nullable: true },
    paidAt: { name: "paid_at", type: "timestamptz" },
    periodStart: { name: "period_start", type: "timestamptz" },
    periodEnd: { name: "period_end", type: "timestamptz" },
    note: { type: "text", nullable: true },
    recordedBy: { name: "recorded_by", type: "uuid", nullable: true },
    createdAt: { name: "created_at", type: "timestamptz", createDate: true },
  },
  indices: [{ name: "idx_subscription_payments_org", columns: ["organizationId", "paidAt"] }],
});

export { SubscriptionPayment };
