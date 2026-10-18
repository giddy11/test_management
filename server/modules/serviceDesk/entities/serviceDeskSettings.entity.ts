// modules/serviceDesk/entities/serviceDeskSettings.entity.ts
// An organisation's IT-requests settings — one row per org, absent means off
// with the default service levels. Off still lets servicedesk.manage holders
// set the catalog up.
import { EntitySchema } from "typeorm";
import type { RequestPriority } from "../domain/lifecycle";
import type { EscalationRules } from "../domain/serviceLevels";

export interface ServiceDeskSettings {
  organizationId: string;
  enabled: boolean;
  // Service levels (see domain/serviceLevels.ts).
  approvalHours: number;
  fulfilmentHours: Record<RequestPriority, number>;
  escalation: EscalationRules;
  // Keep IT agents (queue workers without "set up IT requests") out of approvals.
  // On by default, including for an organisation with no settings row yet.
  agentsCannotApprove: boolean;
  // A request that needs a line manager can't be submitted by someone with none.
  // On by default; off sends that step to an administrator as stand-in.
  requireLineManager: boolean;
  // The starter catalog has been created once; never seed it again.
  catalogSeeded: boolean;
  updatedById: string | null;
  updatedAt: Date;
  updatedBy?: object;
}

const ServiceDeskSettings = new EntitySchema<ServiceDeskSettings>({
  name: "ServiceDeskSettings",
  tableName: "service_desk_settings",
  columns: {
    organizationId: { name: "organization_id", type: "uuid", primary: true },
    enabled: { type: "boolean", default: false },
    approvalHours: { name: "approval_hours", type: "int", default: 48 },
    fulfilmentHours: {
      name: "fulfilment_hours",
      type: "jsonb",
      default: () => `'{"critical":8,"high":24,"medium":72,"low":120}'::jsonb`,
    },
    escalation: {
      type: "jsonb",
      default: () => `'{"level2Pct":50,"level3Pct":100,"contactIds":[]}'::jsonb`,
    },
    agentsCannotApprove: { name: "agents_cannot_approve", type: "boolean", default: true },
    requireLineManager: { name: "require_line_manager", type: "boolean", default: true },
    catalogSeeded: { name: "catalog_seeded", type: "boolean", default: false },
    updatedById: { name: "updated_by_id", type: "uuid", nullable: true },
    updatedAt: { name: "updated_at", type: "timestamptz", updateDate: true },
  },
  relations: {
    updatedBy: { type: "many-to-one", target: "User", joinColumn: { name: "updated_by_id" }, nullable: true, onDelete: "SET NULL" },
  },
});

export { ServiceDeskSettings };
