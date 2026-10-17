// modules/serviceDesk/entities/serviceRequest.entity.ts
// An IT request. `requestNumber` is a global sequence shown as SR-000123.
//
// requestedFor* names who it is FOR when that isn't the requester: a colleague
// (requestedForId), or a new starter who has no account yet (name + email).
// itemSnapshot is the catalog item as it stood at creation, refreshed while
// the request is still a draft and frozen once it is submitted.
import { EntitySchema } from "typeorm";
import type { FormField, FormValues } from "../domain/formSchema";
import type { ApprovalMode, RequestPriority, RequestStatus, RiskLevel } from "../domain/lifecycle";
import type { FulfilmentType } from "../domain/fulfilment";

export interface ItemSnapshot {
  itemId: string;
  name: string;
  categoryKey: string;
  categoryName: string;
  formSchema: FormField[];
  approvalMode: ApprovalMode;
  version: number;
  // Phase 2 — absent on requests raised before it.
  riskLevel?: RiskLevel;
  approvalPolicyName?: string | null;
  approvalHours?: number | null;
  fulfilmentHours?: number | null;
  // Phase 3 — how it's fulfilled, frozen at submit with everything else.
  fulfilmentType?: FulfilmentType;
  endpointId?: string | null;
  requiresIdentityCheck?: boolean;
  isPrivileged?: boolean;
}

// The AI triage shown to approvers and IT — advisory, never acted on.
export interface AiTriage {
  summary: string;
  riskNotes: string[];
  missingInfo: string[];
  suggestedPriority: string | null;
  suggestion: "approve" | "reject" | "ask_for_info" | "no_view";
  suggestionReason: string;
  generatedAt: string;
  generatedById: string;
  generatedByName: string;
  model: string;
}

export interface ServiceRequest {
  id: string;
  requestNumber: number;
  organizationId: string;
  catalogItemId: string | null;
  itemSnapshot: ItemSnapshot;
  requesterId: string;
  requestedForId: string | null;
  requestedForName: string | null;
  requestedForEmail: string | null;
  title: string;
  description: string | null;
  businessJustification: string | null;
  priority: RequestPriority;
  formValues: FormValues;
  status: RequestStatus;
  assigneeId: string | null;
  // IT's closing note — what was done, or why it was cancelled.
  resolutionNote: string | null;
  submittedAt: Date | null;
  approvedAt: Date | null;
  startedAt: Date | null;
  fulfilledAt: Date | null;
  cancelledAt: Date | null;
  statusUpdatedAt: Date | null;
  // ── Phase 2: approval engine, service levels, information requests ────────
  riskLevel: RiskLevel;
  // The approval step currently waiting for decisions (1-based), or null.
  currentStep: number | null;
  approvalDueAt: Date | null;
  approvalTargetHours: number | null;
  approvalEscalationLevel: number;
  // From reaching IT to fulfilled.
  fulfilmentDueAt: Date | null;
  fulfilmentTargetHours: number | null;
  fulfilmentEscalationLevel: number;
  // While status is info_requested: when, from which status (it returns
  // there), and who asked.
  infoRequestedAt: Date | null;
  infoRequestedFrom: RequestStatus | null;
  infoRequestedById: string | null;
  // ── Phase 3: automation ────────────────────────────────────────────────────
  // Flagged by a rule or a failed automation; blocks automatic approval and
  // fulfilment until IT clears it.
  needsReview: boolean;
  reviewReason: string | null;
  autoApproved: boolean;
  // Webhook fulfilment: running | succeeded | failed | manual (IT took over).
  automationStatus: "running" | "succeeded" | "failed" | "manual" | null;
  // person | automation | self_service — set when fulfilled.
  fulfilledBy: "person" | "automation" | "self_service" | null;
  identityVerifiedAt: Date | null;
  identityVerifiedById: string | null;
  identityMethod: string | null;
  identityNote: string | null;
  aiTriage: AiTriage | null;
  createdAt: Date;
  updatedAt: Date;
  catalogItem?: object;
  infoRequestedBy?: object;
  identityVerifiedBy?: object;
  requester?: object;
  requestedFor?: object;
  assignee?: object;
}

const ServiceRequest = new EntitySchema<ServiceRequest>({
  name: "ServiceRequest",
  tableName: "service_requests",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    requestNumber: { name: "request_number", type: "int", generated: "increment", unique: true },
    organizationId: { name: "organization_id", type: "uuid" },
    catalogItemId: { name: "catalog_item_id", type: "uuid", nullable: true },
    itemSnapshot: { name: "item_snapshot", type: "jsonb" },
    requesterId: { name: "requester_id", type: "uuid" },
    requestedForId: { name: "requested_for_id", type: "uuid", nullable: true },
    requestedForName: { name: "requested_for_name", type: "varchar", length: 120, nullable: true },
    requestedForEmail: { name: "requested_for_email", type: "varchar", length: 255, nullable: true },
    title: { type: "varchar", length: 200 },
    description: { type: "text", nullable: true },
    businessJustification: { name: "business_justification", type: "text", nullable: true },
    priority: { type: "varchar", length: 10, default: "medium" },
    formValues: { name: "form_values", type: "jsonb", default: () => "'{}'::jsonb" },
    status: { type: "varchar", length: 20, default: "draft" },
    assigneeId: { name: "assignee_id", type: "uuid", nullable: true },
    resolutionNote: { name: "resolution_note", type: "text", nullable: true },
    submittedAt: { name: "submitted_at", type: "timestamptz", nullable: true },
    approvedAt: { name: "approved_at", type: "timestamptz", nullable: true },
    startedAt: { name: "started_at", type: "timestamptz", nullable: true },
    fulfilledAt: { name: "fulfilled_at", type: "timestamptz", nullable: true },
    cancelledAt: { name: "cancelled_at", type: "timestamptz", nullable: true },
    statusUpdatedAt: { name: "status_updated_at", type: "timestamptz", nullable: true },
    riskLevel: { name: "risk_level", type: "varchar", length: 10, default: "low" },
    currentStep: { name: "current_step", type: "int", nullable: true },
    approvalDueAt: { name: "approval_due_at", type: "timestamptz", nullable: true },
    approvalTargetHours: { name: "approval_target_hours", type: "int", nullable: true },
    approvalEscalationLevel: { name: "approval_escalation_level", type: "int", default: 0 },
    fulfilmentDueAt: { name: "fulfilment_due_at", type: "timestamptz", nullable: true },
    fulfilmentTargetHours: { name: "fulfilment_target_hours", type: "int", nullable: true },
    fulfilmentEscalationLevel: { name: "fulfilment_escalation_level", type: "int", default: 0 },
    infoRequestedAt: { name: "info_requested_at", type: "timestamptz", nullable: true },
    infoRequestedFrom: { name: "info_requested_from", type: "varchar", length: 20, nullable: true },
    infoRequestedById: { name: "info_requested_by_id", type: "uuid", nullable: true },
    needsReview: { name: "needs_review", type: "boolean", default: false },
    reviewReason: { name: "review_reason", type: "varchar", length: 500, nullable: true },
    autoApproved: { name: "auto_approved", type: "boolean", default: false },
    automationStatus: { name: "automation_status", type: "varchar", length: 12, nullable: true },
    fulfilledBy: { name: "fulfilled_by", type: "varchar", length: 12, nullable: true },
    identityVerifiedAt: { name: "identity_verified_at", type: "timestamptz", nullable: true },
    identityVerifiedById: { name: "identity_verified_by_id", type: "uuid", nullable: true },
    identityMethod: { name: "identity_method", type: "varchar", length: 60, nullable: true },
    identityNote: { name: "identity_note", type: "text", nullable: true },
    aiTriage: { name: "ai_triage", type: "jsonb", nullable: true },
    createdAt: { name: "created_at", type: "timestamptz", createDate: true },
    updatedAt: { name: "updated_at", type: "timestamptz", updateDate: true },
  },
  relations: {
    catalogItem: { type: "many-to-one", target: "ServiceCatalogItem", joinColumn: { name: "catalog_item_id" }, nullable: true, onDelete: "SET NULL" },
    requester: { type: "many-to-one", target: "User", joinColumn: { name: "requester_id" } },
    requestedFor: { type: "many-to-one", target: "User", joinColumn: { name: "requested_for_id" }, nullable: true, onDelete: "SET NULL" },
    assignee: { type: "many-to-one", target: "User", joinColumn: { name: "assignee_id" }, nullable: true, onDelete: "SET NULL" },
    infoRequestedBy: { type: "many-to-one", target: "User", joinColumn: { name: "info_requested_by_id" }, nullable: true, onDelete: "SET NULL" },
    identityVerifiedBy: { type: "many-to-one", target: "User", joinColumn: { name: "identity_verified_by_id" }, nullable: true, onDelete: "SET NULL" },
  },
  indices: [
    { name: "idx_service_requests_org_status", columns: ["organizationId", "status", "createdAt"] },
    { name: "idx_service_requests_requester", columns: ["requesterId", "createdAt"] },
    { name: "idx_service_requests_requested_for", columns: ["requestedForId"] },
    { name: "idx_service_requests_assignee", columns: ["assigneeId"] },
    { name: "idx_service_requests_approval_due", columns: ["approvalDueAt"], where: `"status" = 'pending_approval'` },
    { name: "idx_service_requests_needs_review", columns: ["organizationId"], where: `"needs_review" = true` },
    {
      name: "idx_service_requests_fulfilment_due",
      columns: ["fulfilmentDueAt"],
      where: `"status" IN ('submitted', 'approved', 'in_progress')`,
    },
  ],
});

export { ServiceRequest };
