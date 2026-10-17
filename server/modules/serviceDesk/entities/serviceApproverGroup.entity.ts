// modules/serviceDesk/entities/serviceApproverGroup.entity.ts
// A named set of approvers ("Finance", "Security") and the highest risk level
// it may approve. A group asked about something riskier than its authority
// contributes nobody, and its members are refused at decision time.
import { EntitySchema } from "typeorm";
import type { RiskLevel } from "../domain/lifecycle";

export interface ServiceApproverGroup {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  maxRiskLevel: RiskLevel;
  createdAt: Date;
  updatedAt: Date;
}

const ServiceApproverGroup = new EntitySchema<ServiceApproverGroup>({
  name: "ServiceApproverGroup",
  tableName: "service_approver_groups",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    organizationId: { name: "organization_id", type: "uuid" },
    name: { type: "varchar", length: 80 },
    description: { type: "varchar", length: 300, nullable: true },
    maxRiskLevel: { name: "max_risk_level", type: "varchar", length: 10, default: "medium" },
    createdAt: { name: "created_at", type: "timestamptz", createDate: true },
    updatedAt: { name: "updated_at", type: "timestamptz", updateDate: true },
  },
  uniques: [{ name: "uq_service_approver_groups_org_name", columns: ["organizationId", "name"] }],
});

export { ServiceApproverGroup };
