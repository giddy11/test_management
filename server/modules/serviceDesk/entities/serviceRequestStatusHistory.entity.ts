// modules/serviceDesk/entities/serviceRequestStatusHistory.entity.ts
// Every transition a request went through, who made it, and their note.
// Written in the same transaction as the status change.
import { EntitySchema } from "typeorm";

export interface ServiceRequestStatusHistory {
  id: string;
  requestId: string;
  fromStatus: string | null;
  toStatus: string;
  actorId: string | null;
  note: string | null;
  createdAt: Date;
  request?: object;
  actor?: object;
}

const ServiceRequestStatusHistory = new EntitySchema<ServiceRequestStatusHistory>({
  name: "ServiceRequestStatusHistory",
  tableName: "service_request_status_history",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    requestId: { name: "request_id", type: "uuid" },
    fromStatus: { name: "from_status", type: "varchar", length: 20, nullable: true },
    toStatus: { name: "to_status", type: "varchar", length: 20 },
    actorId: { name: "actor_id", type: "uuid", nullable: true },
    note: { type: "text", nullable: true },
    createdAt: { name: "created_at", type: "timestamptz", createDate: true },
  },
  relations: {
    request: { type: "many-to-one", target: "ServiceRequest", joinColumn: { name: "request_id" }, onDelete: "CASCADE" },
    actor: { type: "many-to-one", target: "User", joinColumn: { name: "actor_id" }, nullable: true, onDelete: "SET NULL" },
  },
  indices: [{ name: "idx_service_request_status_history_request", columns: ["requestId", "createdAt"] }],
});

export { ServiceRequestStatusHistory };
