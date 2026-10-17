// modules/serviceDesk/entities/serviceRequestEscalation.entity.ts
// One escalation the sweeper sent. The unique key (request, phase, step,
// level) is what makes the sweeper safe to run twice, or on two servers.
import { EntitySchema } from "typeorm";

export interface ServiceRequestEscalation {
  id: string;
  requestId: string;
  phase: "approval" | "fulfilment";
  stepOrder: number;
  level: number;
  notifiedUserIds: string[];
  createdAt: Date;
  request?: object;
}

const ServiceRequestEscalation = new EntitySchema<ServiceRequestEscalation>({
  name: "ServiceRequestEscalation",
  tableName: "service_request_escalations",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    requestId: { name: "request_id", type: "uuid" },
    phase: { type: "varchar", length: 12 },
    stepOrder: { name: "step_order", type: "int", default: 0 },
    level: { type: "int" },
    notifiedUserIds: { name: "notified_user_ids", type: "uuid", array: true, default: () => "'{}'" },
    createdAt: { name: "created_at", type: "timestamptz", createDate: true },
  },
  relations: {
    request: { type: "many-to-one", target: "ServiceRequest", joinColumn: { name: "request_id" }, onDelete: "CASCADE" },
  },
  uniques: [{ name: "uq_service_request_escalations_once", columns: ["requestId", "phase", "stepOrder", "level"] }],
});

export { ServiceRequestEscalation };
