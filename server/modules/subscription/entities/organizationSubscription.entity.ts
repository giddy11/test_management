// modules/subscription/entities/organizationSubscription.entity.ts
// Which plan an organisation is on. No row means Free. A paid or trial plan
// carries an end date; once it passes, the organisation is treated as Free
// again (worked out on read, so no scheduled job is needed).
import { EntitySchema } from "typeorm";
import type { PlanKey } from "../domain/planCatalog";

export type SubscriptionStatus = "active" | "trial";
// How the plan was set: by hand on the Organisations page, or by recording an
// offline payment. A payment provider would add its own value later.
export type SubscriptionSource = "manual" | "offline_payment";

export interface OrganizationSubscription {
  organizationId: string;
  planKey: PlanKey;
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
  // Paid up to here. Null on an active plan means no end date (complimentary).
  paidUntil: Date | null;
  source: SubscriptionSource;
  note: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const OrganizationSubscription = new EntitySchema<OrganizationSubscription>({
  name: "OrganizationSubscription",
  tableName: "organization_subscriptions",
  columns: {
    organizationId: { name: "organization_id", type: "uuid", primary: true },
    planKey: { name: "plan_key", type: "varchar", length: 20 },
    status: { type: "varchar", length: 20, default: "active" },
    trialEndsAt: { name: "trial_ends_at", type: "timestamptz", nullable: true },
    paidUntil: { name: "paid_until", type: "timestamptz", nullable: true },
    source: { type: "varchar", length: 30, default: "manual" },
    note: { type: "text", nullable: true },
    updatedBy: { name: "updated_by", type: "uuid", nullable: true },
    createdAt: { name: "created_at", type: "timestamptz", createDate: true },
    updatedAt: { name: "updated_at", type: "timestamptz", updateDate: true },
  },
});

export { OrganizationSubscription };
