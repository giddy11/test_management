// modules/serviceDesk/entities/serviceCatalogItem.entity.ts
// One thing people can ask for: its form, and who approves it.
//
// approvalMode "approvers" with an empty approverIds is allowed — the decision
// then falls to the organisation's servicedesk.manage holders, so a starter
// item works before anyone has been named. `version` goes up on every edit and
// is copied onto each request with the rest of the item, so a request is always
// judged by the form and approvers it was raised under.
import { EntitySchema } from "typeorm";
import type { FormField } from "../domain/formSchema";
import type { ApprovalMode, RiskLevel } from "../domain/lifecycle";
import type { FulfilmentConfig, FulfilmentType } from "../domain/fulfilment";

export interface ServiceCatalogItem {
  id: string;
  organizationId: string;
  categoryId: string;
  name: string;
  description: string | null;
  formSchema: FormField[];
  approvalMode: ApprovalMode;
  approverIds: string[];
  // approvalMode "policy": the approval policy whose steps it follows.
  approvalPolicyId: string | null;
  // Travels onto each request; approver groups may only decide up to their own level.
  riskLevel: RiskLevel;
  // Service-level overrides, in hours. Null = the organisation's defaults.
  approvalHours: number | null;
  fulfilmentHours: number | null;
  // ── Phase 3 ──────────────────────────────────────────────────────────────
  // How it's fulfilled: by a person, by a webhook connector, or by sending
  // the person to a self-service link (see domain/fulfilment.ts).
  fulfilmentType: FulfilmentType;
  fulfilmentConfig: FulfilmentConfig;
  // An automation rule may approve it without a person — only ever when the
  // item is also low-risk, not privileged and needs no identity check.
  autoApprove: boolean;
  // Privileged access (admin rights, production): never approved automatically.
  isPrivileged: boolean;
  // IT must record how they confirmed the person's identity before working it.
  requiresIdentityCheck: boolean;
  // Instructions for whoever fulfils it — shown to IT only, never the requester.
  fulfilmentNotes: string | null;
  isActive: boolean;
  sortOrder: number;
  version: number;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
  category?: object;
  createdBy?: object;
  approvalPolicy?: object;
}

const ServiceCatalogItem = new EntitySchema<ServiceCatalogItem>({
  name: "ServiceCatalogItem",
  tableName: "service_catalog_items",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    organizationId: { name: "organization_id", type: "uuid" },
    categoryId: { name: "category_id", type: "uuid" },
    name: { type: "varchar", length: 120 },
    description: { type: "text", nullable: true },
    formSchema: { name: "form_schema", type: "jsonb", default: () => "'[]'::jsonb" },
    approvalMode: { name: "approval_mode", type: "varchar", length: 20, default: "none" },
    approverIds: { name: "approver_ids", type: "uuid", array: true, default: () => "'{}'" },
    approvalPolicyId: { name: "approval_policy_id", type: "uuid", nullable: true },
    riskLevel: { name: "risk_level", type: "varchar", length: 10, default: "low" },
    approvalHours: { name: "approval_hours", type: "int", nullable: true },
    fulfilmentHours: { name: "fulfilment_hours", type: "int", nullable: true },
    fulfilmentType: { name: "fulfilment_type", type: "varchar", length: 10, default: "manual" },
    fulfilmentConfig: { name: "fulfilment_config", type: "jsonb", default: () => "'{}'::jsonb" },
    autoApprove: { name: "auto_approve", type: "boolean", default: false },
    isPrivileged: { name: "is_privileged", type: "boolean", default: false },
    requiresIdentityCheck: { name: "requires_identity_check", type: "boolean", default: false },
    fulfilmentNotes: { name: "fulfilment_notes", type: "text", nullable: true },
    isActive: { name: "is_active", type: "boolean", default: true },
    sortOrder: { name: "sort_order", type: "int", default: 0 },
    version: { type: "int", default: 1 },
    createdById: { name: "created_by_id", type: "uuid", nullable: true },
    createdAt: { name: "created_at", type: "timestamptz", createDate: true },
    updatedAt: { name: "updated_at", type: "timestamptz", updateDate: true },
  },
  relations: {
    category: { type: "many-to-one", target: "ServiceCatalogCategory", joinColumn: { name: "category_id" }, onDelete: "CASCADE" },
    createdBy: { type: "many-to-one", target: "User", joinColumn: { name: "created_by_id" }, nullable: true, onDelete: "SET NULL" },
    approvalPolicy: {
      type: "many-to-one",
      target: "ServiceApprovalPolicy",
      joinColumn: { name: "approval_policy_id" },
      nullable: true,
      onDelete: "SET NULL",
    },
  },
  indices: [{ name: "idx_service_catalog_items_org_category", columns: ["organizationId", "categoryId"] }],
});

export { ServiceCatalogItem };
