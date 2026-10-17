// modules/serviceDesk/entities/serviceRequestApproval.entity.ts
// One approver's say on one request. Phase 1 has a single step (stepOrder 1)
// where any one approver decides; the others' rows become "skipped". The
// column is there so sequential steps (Phase 2) need no new table.
import { EntitySchema } from "typeorm";
import type { ApprovalDecision } from "../domain/lifecycle";

export interface ServiceRequestApproval {
  id: string;
  requestId: string;
  stepOrder: number;
  approverId: string;
  decision: ApprovalDecision;
  comment: string | null;
  decidedAt: Date | null;
  createdAt: Date;
  request?: object;
  approver?: object;
}

const ServiceRequestApproval = new EntitySchema<ServiceRequestApproval>({
  name: "ServiceRequestApproval",
  tableName: "service_request_approvals",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    requestId: { name: "request_id", type: "uuid" },
    stepOrder: { name: "step_order", type: "int", default: 1 },
    approverId: { name: "approver_id", type: "uuid" },
    decision: { type: "varchar", length: 10, default: "pending" },
    comment: { type: "text", nullable: true },
    decidedAt: { name: "decided_at", type: "timestamptz", nullable: true },
    createdAt: { name: "created_at", type: "timestamptz", createDate: true },
  },
  relations: {
    request: { type: "many-to-one", target: "ServiceRequest", joinColumn: { name: "request_id" }, onDelete: "CASCADE" },
    approver: { type: "many-to-one", target: "User", joinColumn: { name: "approver_id" } },
  },
  uniques: [{ name: "uq_service_request_approvals_step_approver", columns: ["requestId", "stepOrder", "approverId"] }],
  indices: [{ name: "idx_service_request_approvals_approver", columns: ["approverId", "decision"] }],
});

export { ServiceRequestApproval };
