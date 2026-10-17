// modules/serviceDesk/entities/serviceAutomationRun.entity.ts
// One automated thing that happened to a request — a rule applied, an
// automatic approval (or the refusal of one), a webhook delivery, a
// self-service deflection, an AI triage — with its outcome. This is the
// record story 2 asks for (AC 2.9): what ran, under which rule or connector,
// on whose behalf, and what came of it.
//
//   status   succeeded | failed | skipped (refused, with the reason in detail)
//            | pending (webhook accepted, waiting for its callback)
//            | retrying (delivery failed, next attempt at nextAttemptAt)
//   callbackTokenHash  sha256 of the one-time callback token (webhooks only)
import { EntitySchema } from "typeorm";

export const RUN_KINDS = ["rule", "auto_approve", "webhook", "deflect", "ai_triage"] as const;
export type RunKind = (typeof RUN_KINDS)[number];
export const RUN_STATUSES = ["succeeded", "failed", "skipped", "pending", "retrying"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export interface ServiceAutomationRun {
  id: string;
  organizationId: string;
  requestId: string;
  kind: RunKind;
  status: RunStatus;
  ruleId: string | null;
  ruleName: string | null;
  endpointId: string | null;
  attempt: number;
  nextAttemptAt: Date | null;
  callbackTokenHash: string | null;
  detail: Record<string, unknown> | null;
  error: string | null;
  initiatedById: string | null;
  startedAt: Date;
  finishedAt: Date | null;
  request?: object;
  rule?: object;
  endpoint?: object;
  initiatedBy?: object;
}

const ServiceAutomationRun = new EntitySchema<ServiceAutomationRun>({
  name: "ServiceAutomationRun",
  tableName: "service_automation_runs",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    organizationId: { name: "organization_id", type: "uuid" },
    requestId: { name: "request_id", type: "uuid" },
    kind: { type: "varchar", length: 20 },
    status: { type: "varchar", length: 12 },
    ruleId: { name: "rule_id", type: "uuid", nullable: true },
    ruleName: { name: "rule_name", type: "varchar", length: 80, nullable: true },
    endpointId: { name: "endpoint_id", type: "uuid", nullable: true },
    attempt: { type: "int", default: 0 },
    nextAttemptAt: { name: "next_attempt_at", type: "timestamptz", nullable: true },
    callbackTokenHash: { name: "callback_token_hash", type: "varchar", length: 64, nullable: true },
    detail: { type: "jsonb", nullable: true },
    error: { type: "varchar", length: 500, nullable: true },
    initiatedById: { name: "initiated_by_id", type: "uuid", nullable: true },
    startedAt: { name: "started_at", type: "timestamptz", createDate: true },
    finishedAt: { name: "finished_at", type: "timestamptz", nullable: true },
  },
  relations: {
    request: { type: "many-to-one", target: "ServiceRequest", joinColumn: { name: "request_id" }, onDelete: "CASCADE" },
    rule: { type: "many-to-one", target: "ServiceAutomationRule", joinColumn: { name: "rule_id" }, nullable: true, onDelete: "SET NULL" },
    endpoint: { type: "many-to-one", target: "ServiceWebhookEndpoint", joinColumn: { name: "endpoint_id" }, nullable: true, onDelete: "SET NULL" },
    initiatedBy: { type: "many-to-one", target: "User", joinColumn: { name: "initiated_by_id" }, nullable: true, onDelete: "SET NULL" },
  },
  indices: [
    { name: "idx_service_automation_runs_request", columns: ["requestId", "startedAt"] },
    { name: "idx_service_automation_runs_org", columns: ["organizationId", "startedAt"] },
    { name: "idx_service_automation_runs_due", columns: ["nextAttemptAt"], where: `"status" IN ('retrying', 'pending')` },
  ],
});

export { ServiceAutomationRun };
