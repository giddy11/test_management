// modules/subscription/entities/planEntitlement.entity.ts
// What a plan unlocks, as edited by the platform owner. One row per plan key;
// no row means the defaults in domain/planCatalog.ts.
import { EntitySchema } from "typeorm";
import type { FeatureSet, LimitSet, PlanKey } from "../domain/planCatalog";

export interface PlanEntitlement {
  planKey: PlanKey;
  features: Partial<FeatureSet>;
  limits: Partial<LimitSet>;
  updatedBy: string | null;
  updatedAt: Date;
}

const PlanEntitlement = new EntitySchema<PlanEntitlement>({
  name: "PlanEntitlement",
  tableName: "plan_entitlements",
  columns: {
    planKey: { name: "plan_key", type: "varchar", length: 20, primary: true },
    features: { type: "jsonb" },
    limits: { type: "jsonb" },
    updatedBy: { name: "updated_by", type: "uuid", nullable: true },
    updatedAt: { name: "updated_at", type: "timestamptz", updateDate: true },
  },
});

export { PlanEntitlement };
