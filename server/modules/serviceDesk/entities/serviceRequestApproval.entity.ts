// modules/serviceDesk/entities/serviceRequestApproval.entity.ts
// One person's say on one step of one request. The whole plan is written at
// submit: step 1's rows start "pending", later steps' rows "waiting" until the
// step before them completes (see domain/approvalPlan.ts).
//
//   ruleIndex      which of the step's approver rules this row satisfies — an
//                  "all" step completes when every rule has an approval
//   groupId        set when the person is here as a member of an approver
//                  group; the group's authority is re-checked when they decide
//   isFallback     nobody the policy named could decide, so this person (a
//                  servicedesk.manage holder) was asked instead
//   onBehalfOfId   this person is standing in for someone away (delegation)
//   decidedById    who actually clicked — the approver, or their delegate
//   authorityLevel the group's maximum risk at the moment of the decision
import { EntitySchema } from "typeorm";
import type { ApprovalDecision, RiskLevel } from "../domain/lifecycle";
import type { StepMode } from "../domain/approvalPlan";

export interface ServiceRequestApproval {
  id: string;
  requestId: string;
  stepOrder: number;
  stepName: string | null;
  stepMode: StepMode;
  ruleIndex: number;
  approverId: string;
  groupId: string | null;
  isFallback: boolean;
  onBehalfOfId: string | null;
  decision: ApprovalDecision;
  comment: string | null;
  decidedAt: Date | null;
  decidedById: string | null;
  authorityLevel: RiskLevel | null;
  createdAt: Date;
  request?: object;
  approver?: object;
  group?: object;
  onBehalfOf?: object;
  decidedBy?: object;
}

const ServiceRequestApproval = new EntitySchema<ServiceRequestApproval>({
  name: "ServiceRequestApproval",
  tableName: "service_request_approvals",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    requestId: { name: "request_id", type: "uuid" },
    stepOrder: { name: "step_order", type: "int", default: 1 },
    stepName: { name: "step_name", type: "varchar", length: 80, nullable: true },
    stepMode: { name: "step_mode", type: "varchar", length: 5, default: "any" },
    ruleIndex: { name: "rule_index", type: "int", default: 0 },
    approverId: { name: "approver_id", type: "uuid" },
    groupId: { name: "group_id", type: "uuid", nullable: true },
    isFallback: { name: "is_fallback", type: "boolean", default: false },
    onBehalfOfId: { name: "on_behalf_of_id", type: "uuid", nullable: true },
    decision: { type: "varchar", length: 10, default: "pending" },
    comment: { type: "text", nullable: true },
    decidedAt: { name: "decided_at", type: "timestamptz", nullable: true },
    decidedById: { name: "decided_by_id", type: "uuid", nullable: true },
    authorityLevel: { name: "authority_level", type: "varchar", length: 10, nullable: true },
    createdAt: { name: "created_at", type: "timestamptz", createDate: true },
  },
  relations: {
    request: { type: "many-to-one", target: "ServiceRequest", joinColumn: { name: "request_id" }, onDelete: "CASCADE" },
    approver: { type: "many-to-one", target: "User", joinColumn: { name: "approver_id" } },
    group: { type: "many-to-one", target: "ServiceApproverGroup", joinColumn: { name: "group_id" }, nullable: true, onDelete: "SET NULL" },
    onBehalfOf: { type: "many-to-one", target: "User", joinColumn: { name: "on_behalf_of_id" }, nullable: true, onDelete: "SET NULL" },
    decidedBy: { type: "many-to-one", target: "User", joinColumn: { name: "decided_by_id" }, nullable: true, onDelete: "SET NULL" },
  },
  uniques: [{ name: "uq_service_request_approvals_step_approver", columns: ["requestId", "stepOrder", "approverId"] }],
  indices: [{ name: "idx_service_request_approvals_approver", columns: ["approverId", "decision"] }],
});

export { ServiceRequestApproval };
