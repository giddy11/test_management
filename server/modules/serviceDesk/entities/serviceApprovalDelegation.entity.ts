// modules/serviceDesk/entities/serviceApprovalDelegation.entity.ts
// "While I'm away, this person approves for me." One per person, set by
// themselves; active from startsOn to endsOn inclusive.
import { EntitySchema } from "typeorm";

export interface ServiceApprovalDelegation {
  userId: string;
  organizationId: string;
  delegateId: string;
  startsOn: string; // YYYY-MM-DD
  endsOn: string;
  note: string | null;
  createdAt: Date;
  user?: object;
  delegate?: object;
}

const ServiceApprovalDelegation = new EntitySchema<ServiceApprovalDelegation>({
  name: "ServiceApprovalDelegation",
  tableName: "service_approval_delegations",
  columns: {
    userId: { name: "user_id", type: "uuid", primary: true },
    organizationId: { name: "organization_id", type: "uuid" },
    delegateId: { name: "delegate_id", type: "uuid" },
    startsOn: { name: "starts_on", type: "date" },
    endsOn: { name: "ends_on", type: "date" },
    note: { type: "varchar", length: 200, nullable: true },
    createdAt: { name: "created_at", type: "timestamptz", createDate: true },
  },
  relations: {
    user: { type: "many-to-one", target: "User", joinColumn: { name: "user_id" }, onDelete: "CASCADE" },
    delegate: { type: "many-to-one", target: "User", joinColumn: { name: "delegate_id" }, onDelete: "CASCADE" },
  },
  indices: [{ name: "idx_service_approval_delegations_delegate", columns: ["delegateId"] }],
});

export { ServiceApprovalDelegation };
