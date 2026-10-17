// modules/serviceDesk/entities/serviceApprovalPolicy.entity.ts
// A reusable approval route: ordered steps, each needing any one or all of its
// approver rules. Catalog items in "policy" mode point at one. See
// domain/approvalPlan.ts for exactly how steps are staffed and decided.
import { EntitySchema } from "typeorm";
import type { PolicyStep } from "../domain/approvalPlan";

export interface ServiceApprovalPolicy {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  steps: PolicyStep[];
  createdAt: Date;
  updatedAt: Date;
}

const ServiceApprovalPolicy = new EntitySchema<ServiceApprovalPolicy>({
  name: "ServiceApprovalPolicy",
  tableName: "service_approval_policies",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    organizationId: { name: "organization_id", type: "uuid" },
    name: { type: "varchar", length: 80 },
    description: { type: "varchar", length: 300, nullable: true },
    steps: { type: "jsonb", default: () => "'[]'::jsonb" },
    createdAt: { name: "created_at", type: "timestamptz", createDate: true },
    updatedAt: { name: "updated_at", type: "timestamptz", updateDate: true },
  },
  uniques: [{ name: "uq_service_approval_policies_org_name", columns: ["organizationId", "name"] }],
});

export { ServiceApprovalPolicy };
