// modules/sla/entities/slaEscalation.entity.ts
// One SLA escalation the sweeper sent. The unique key (issue, metric, level)
// is what makes the sweeper safe to run twice, or on two servers.
import { EntitySchema } from "typeorm";

export type SlaEscalationMetric = "first_response" | "resolution";

export interface SlaEscalation {
  id: string;
  organizationId: string;
  source: "ticket" | "bug" | "feature_request";
  issueId: string;
  metric: SlaEscalationMetric;
  level: number;
  notifiedUserIds: string[];
  createdAt: Date;
}

const SlaEscalation = new EntitySchema<SlaEscalation>({
  name: "SlaEscalation",
  tableName: "sla_escalations",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    organizationId: { name: "organization_id", type: "uuid" },
    source: { type: "varchar", length: 20 },
    issueId: { name: "issue_id", type: "uuid" },
    metric: { type: "varchar", length: 20 },
    level: { type: "int" },
    notifiedUserIds: { name: "notified_user_ids", type: "uuid", array: true, default: () => "'{}'" },
    createdAt: { name: "created_at", type: "timestamptz", createDate: true },
  },
  uniques: [{ name: "uq_sla_escalations_once", columns: ["issueId", "metric", "level"] }],
});

export { SlaEscalation };
