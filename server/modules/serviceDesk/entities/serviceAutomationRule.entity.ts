// modules/serviceDesk/entities/serviceAutomationRule.entity.ts
// "When a request matches these conditions, do these things." Evaluated once,
// at submit, lowest sortOrder first (see domain/automationRules.ts).
import { EntitySchema } from "typeorm";
import type { RuleActions, RuleConditions } from "../domain/automationRules";

export interface ServiceAutomationRule {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  conditions: RuleConditions;
  actions: RuleActions;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: object;
}

const ServiceAutomationRule = new EntitySchema<ServiceAutomationRule>({
  name: "ServiceAutomationRule",
  tableName: "service_automation_rules",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    organizationId: { name: "organization_id", type: "uuid" },
    name: { type: "varchar", length: 80 },
    description: { type: "varchar", length: 300, nullable: true },
    sortOrder: { name: "sort_order", type: "int", default: 100 },
    isActive: { name: "is_active", type: "boolean", default: true },
    conditions: { type: "jsonb", default: () => "'{}'::jsonb" },
    actions: { type: "jsonb", default: () => "'{}'::jsonb" },
    createdById: { name: "created_by_id", type: "uuid", nullable: true },
    createdAt: { name: "created_at", type: "timestamptz", createDate: true },
    updatedAt: { name: "updated_at", type: "timestamptz", updateDate: true },
  },
  relations: {
    createdBy: { type: "many-to-one", target: "User", joinColumn: { name: "created_by_id" }, nullable: true, onDelete: "SET NULL" },
  },
  indices: [{ name: "idx_service_automation_rules_org", columns: ["organizationId", "sortOrder"] }],
});

export { ServiceAutomationRule };
